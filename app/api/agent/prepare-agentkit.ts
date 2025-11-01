import {
  ActionProvider,
  AgentKit,
  erc20ActionProvider,
  pythActionProvider,
  ViemWalletProvider,
  walletActionProvider,
  wethActionProvider,
} from "@coinbase/agentkit";
import fs from "fs";
import { createWalletClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * AgentKit Integration Route
 *
 * Intuition Testnet Configuration
 * Chain ID: 13579
 * RPC: https://testnet.rpc.intuition.systems/http
 */

const WALLET_DATA_FILE = "wallet_data.txt";

export async function prepareAgentkitAndWalletProvider(): Promise<{
  agentkit: AgentKit;
  walletProvider: ViemWalletProvider;
}> {
  try {
    // Load or create private key
    let privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    if (!privateKey) {
      if (fs.existsSync(WALLET_DATA_FILE)) {
        privateKey = JSON.parse(fs.readFileSync(WALLET_DATA_FILE, "utf8")).privateKey;
        console.info("Found private key in wallet_data.txt");
      } else {
        privateKey = generatePrivateKey();
        fs.writeFileSync(WALLET_DATA_FILE, JSON.stringify({ privateKey }));
        console.log("Created new private key and saved to wallet_data.txt");
        console.log(
          "Save this private key to your .env file and delete wallet_data.txt afterward."
        );
      }
    }

    const account = privateKeyToAccount(privateKey);

    // Configure Intuition network
    const rpcUrl = process.env.RPC_URL || "https://testnet.rpc.intuition.systems/http";
    const chainId = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 13579;

    const client = createWalletClient({
      account,
      chain: {
        id: chainId,
        rpcUrls: {
          default: {
            http: [rpcUrl],
          },
        },
        name: "Intuition Testnet",
        nativeCurrency: {
          name: "Intuition",
          symbol: "tTRUST",
          decimals: 18,
        },
      },
      transport: http(rpcUrl),
    });

    const walletProvider = new ViemWalletProvider(client);

    // Configure action providers (no Coinbase Cloud dependency)
    const actionProviders: ActionProvider[] = [
      wethActionProvider(),
      pythActionProvider(),
      walletActionProvider(),
      erc20ActionProvider(),
    ];

    // Removed cdpApiActionProvider to avoid coinbase_cloud_api_key.json
    // const canUseCdpApi = process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET;
    // if (canUseCdpApi) {
    //   actionProviders.push(
    //     cdpApiActionProvider({
    //       apiKeyId: process.env.CDP_API_KEY_ID,
    //       apiKeySecret: process.env.CDP_API_KEY_SECRET,
    //     }),
    //   );
    // }

    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders,
    });

    console.log("AgentKit initialized on Intuition Testnet");
    console.log(`Address: ${account.address}`);
    console.log(`RPC: ${rpcUrl}`);

    return { agentkit, walletProvider };
  } catch (error) {
    console.error("Error initializing agent:", error);
    throw new Error("Failed to initialize agent");
  }
}
