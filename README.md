BlockPay Agent — Intuition Network Integration

This project integrates a blockchain agent powered by Coinbase AgentKit to interact seamlessly with the Intuition Testnet.
It enables intelligent on-chain actions like sending tokens, fetching contract data, swapping assets, and interacting with ERC20 contracts, all through natural language input.

Features

Connect to Intuition Testnet (Chain ID: 13579)
Send, receive, and manage ERC20 tokens on intuition network
Interact with smart contracts (ERC20, WETH, etc.)
Fetch price feeds using Pyth action provider
Integrate with a front-end chat UI for natural interactions

Project Structure
```
BlockPay/
├── app/                   # Next.js application frontend
├── pages/api/agent/       # API endpoint for the agent
├── prepareAgentkit.ts     # Initializes AgentKit and wallet provider
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── .env                   # Environment variables
```



Author
Ottah Samuel Sunday
Enugu, Nigeria
michaelsamuelpedro@gmail.com