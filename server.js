// File: server.js
const express = require('express');
const xrpl = require('xrpl');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();
const port = process.env.PORT || 3000;

const client = new xrpl.Client('wss://s1.ripple.com');
const cache = new NodeCache({ stdTTL: 600 }); // Cache for 10 minutes

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Middleware for input validation
const validateInput = (req, res, next) => {
  const { id, fromBlock, toBlock } = req.query;
  if (req.path === '/asset' && !id) {
    return res.status(400).json({ error: 'Asset ID is required' });
  }
  if (req.path === '/events' && (!fromBlock || !toBlock)) {
    return res.status(400).json({ error: 'Both fromBlock and toBlock are required' });
  }
  next();
};

app.use(validateInput);

app.get('/latest-block', async (req, res) => {
  try {
    const cachedBlock = cache.get('latest-block');
    if (cachedBlock) {
      return res.json(cachedBlock);
    }

    await client.connect();
    const ledger = await client.request({
      command: 'ledger',
      ledger_index: 'validated'
    });
    await client.disconnect();

    const block = {
      block: {
        blockNumber: ledger.result.ledger_index,
        blockTimestamp: Math.floor(ledger.result.ledger.close_time + 946684800)
      }
    };

    cache.set('latest-block', block);
    res.json(block);
  } catch (error) {
    console.error('Error fetching latest block:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/asset', async (req, res) => {
  const { id } = req.query;
  const assetIds = Array.isArray(id) ? id : id.split(',');
  const assets = [];

  try {
    await client.connect();

    for (const assetId of assetIds) {
      const cachedAsset = cache.get(`asset-${assetId}`);
      if (cachedAsset) {
        assets.push(cachedAsset);
        continue;
      }

      if (assetId === 'XRP') {
        const xrpAsset = {
          id: 'XRP',
          name: 'XRP',
          symbol: 'XRP',
          totalSupply: '100000000000',
          circulatingSupply: '45000000000',
          coinGeckoId: 'ripple',
          coinMarketCapId: 'xrp'
        };
        assets.push(xrpAsset);
        cache.set(`asset-${assetId}`, xrpAsset);
      } else {
        const [currency, issuer] = assetId.split('.');
        
        if (!currency || !issuer) {
          assets.push({ id: assetId, error: 'Invalid asset ID format' });
          continue;
        }

        try {
          const accountInfo = await client.request({
            command: 'account_info',
            account: issuer
          });

          const trustlines = await client.request({
            command: 'gateway_balances',
            account: issuer,
            strict: true,
            hotwallet: []
          });

          const totalSupply = trustlines.result.obligations[currency] || '0';

          const asset = {
            id: assetId,
            name: `${currency} (${issuer.slice(0, 8)}...)`,
            symbol: currency,
            totalSupply: totalSupply,
            circulatingSupply: totalSupply,
            metadata: {
              issuer: issuer,
              domain: accountInfo.result.account_data.Domain 
                ? Buffer.from(accountInfo.result.account_data.Domain, 'hex').toString('utf-8') 
                : undefined
            }
          };
          assets.push(asset);
          cache.set(`asset-${assetId}`, asset);
        } catch (error) {
          console.error(`Error fetching asset ${assetId}:`, error);
          assets.push({ id: assetId, error: 'Failed to fetch asset information' });
        }
      }
    }

    await client.disconnect();

    res.json({ assets });
  } catch (error) {
    console.error('Error in asset endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/pair', async (req, res) => {
  const { id } = req.query;

  const cachedPair = cache.get(`pair-${id}`);
  if (cachedPair) {
    return res.json(cachedPair);
  }

  try {
    await client.connect();

    const [base, quote] = id.split('_');
    const [baseCurrency, baseIssuer] = base.split('.');
    const [quoteCurrency, quoteIssuer] = quote.split('.');

    // Fetch order book to get the first trade
    const orderBook = await client.request({
      command: 'book_offers',
      taker_gets: {
        currency: baseCurrency,
        issuer: baseIssuer
      },
      taker_pays: {
        currency: quoteCurrency,
        issuer: quoteIssuer
      },
      limit: 1
    });

    const firstOffer = orderBook.result.offers[0];

    if (!firstOffer) {
      return res.status(404).json({ error: 'Pair not found' });
    }

    const pair = {
      pair: {
        id: id,
        dexKey: 'xrpl',
        asset0Id: base,
        asset1Id: quote,
        feeBps: 10, // Standard XRPL DEX fee
        createdAtBlockNumber: firstOffer.bookDirectory,
        createdAtBlockTimestamp: Math.floor(firstOffer.date + 946684800)
      }
    };

    cache.set(`pair-${id}`, pair);
    res.json(pair);

    await client.disconnect();
  } catch (error) {
    console.error('Error fetching pair:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/events', async (req, res) => {
  const { fromBlock, toBlock } = req.query;

  try {
    await client.connect();
    
    const events = [];

    for (let i = Number(fromBlock); i <= Number(toBlock); i++) {
      const txns = await client.request({
        command: 'ledger',
        ledger_index: i,
        transactions: true,
        expand: true
      });

      for (let j = 0; j < txns.result.ledger.transactions.length; j++) {
        const txn = txns.result.ledger.transactions[j];
        if (txn.TransactionType === 'OfferCreate' || txn.TransactionType === 'Payment') {
          let asset0In, asset1Out, priceNative;
          let pairId;

          if (txn.TransactionType === 'OfferCreate') {
            const takerGets = typeof txn.TakerGets === 'object' ? txn.TakerGets : { currency: 'XRP', value: xrpl.dropsToXrp(txn.TakerGets) };
            const takerPays = typeof txn.TakerPays === 'object' ? txn.TakerPays : { currency: 'XRP', value: xrpl.dropsToXrp(txn.TakerPays) };

            asset0In = takerGets.value;
            asset1Out = takerPays.value;
            priceNative = Number(asset1Out) / Number(asset0In);
            pairId = `${takerGets.currency}${takerGets.issuer ? '.' + takerGets.issuer : ''}_${takerPays.currency}${takerPays.issuer ? '.' + takerPays.issuer : ''}`;
          } else if (txn.TransactionType === 'Payment' && txn.DeliverMin) {
            const amount = typeof txn.Amount === 'object' ? txn.Amount : { currency: 'XRP', value: xrpl.dropsToXrp(txn.Amount) };
            const deliverMin = typeof txn.DeliverMin === 'object' ? txn.DeliverMin : { currency: 'XRP', value: xrpl.dropsToXrp(txn.DeliverMin) };

            asset0In = amount.value;
            asset1Out = deliverMin.value;
            priceNative = Number(asset1Out) / Number(asset0In);
            pairId = `${amount.currency}${amount.issuer ? '.' + amount.issuer : ''}_${deliverMin.currency}${deliverMin.issuer ? '.' + deliverMin.issuer : ''}`;
          } else {
            continue; // Skip other types of payments
          }

          events.push({
            block: {
              blockNumber: i,
              blockTimestamp: Math.floor(txns.result.ledger.close_time + 946684800)
            },
            eventType: 'swap',
            txnId: txn.hash,
            txnIndex: j,
            eventIndex: 0,
            maker: txn.Account,
            pairId: pairId,
            asset0In: asset0In.toString(),
            asset1Out: asset1Out.toString(),
            priceNative: priceNative.toString(),
            reserves: {
              asset0: '0', // XRPL doesn't have liquidity pools, so we can't provide this information
              asset1: '0'
            }
          });
        }
      }
    }

    await client.disconnect();

    res.json({ events });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(port, () => {
  console.log(`XRPL DEX Adapter API listening at http://localhost:${port}`);
});
