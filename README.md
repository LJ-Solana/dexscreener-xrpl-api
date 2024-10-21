# XRPL DEX Adapter API

## Overview

The XRPL DEX Adapter API is a Node.js application that serves as an adapter between the XRP Ledger (XRPL) decentralized exchange and the DEX Screener platform. It provides a set of HTTP endpoints that allow DEX Screener to track historical and real-time data for the XRPL decentralized exchange.

## Features

- Fetch latest block information
- Retrieve asset details (XRP and issued currencies)
- Get trading pair information
- Fetch swap events within a specified block range
- Caching mechanism to improve performance
- Rate limiting to prevent abuse

## Prerequisites

- Node.js (v14 or later recommended)
- npm (usually comes with Node.js)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/xrpl-dex-adapter.git
   cd xrpl-dex-adapter
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory and add the following (adjust as needed):
   ```
   PORT=3000
   XRPL_NODE_URL=wss://s1.ripple.com
   ```

## Usage

To start the server:

```
npm start
```

The server will start on the port specified in your `.env` file (default is 3000).

## API Endpoints

### 1. Latest Block

- **GET** `/latest-block`
- Returns information about the latest validated ledger.

### 2. Asset Information

- **GET** `/asset?id=:assetId`
- Returns information about a specific asset or multiple assets.
- For multiple assets, use comma-separated IDs.

### 3. Pair Information

- **GET** `/pair?id=:pairId`
- Returns information about a specific trading pair.

### 4. Events

- **GET** `/events?fromBlock=:number&toBlock=:number`
- Returns swap events within the specified block range.

## Example Requests

1. Fetch latest block:
   ```
   GET http://localhost:3000/latest-block
   ```

2. Get asset information:
   ```
   GET http://localhost:3000/asset?id=XRP,USD.rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq
   ```

3. Get pair information:
   ```
   GET http://localhost:3000/pair?id=XRP_USD.rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq
   ```

4. Fetch events:
   ```
   GET http://localhost:3000/events?fromBlock=80000000&toBlock=80000010
   ```

## Error Handling

The API uses standard HTTP status codes for error responses. In case of an error, the response will include a JSON object with an `error` field containing a description of the error.

## Rate Limiting

The API implements rate limiting to prevent abuse. By default, it allows 100 requests per 15-minute window per IP address.

## Caching

Responses are cached for 10 minutes to improve performance and reduce load on the XRPL nodes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License.

## Disclaimer

This software is provided "as is", without warranty of any kind. Use at your own risk.

## Contact

If you have any questions or feedback, please open an issue in the GitHub repository.
