# IPFS Setup Guide

The Job Pool system requires IPFS storage for uploading job metadata and submission previews. This guide will help you set up an IPFS provider.

## Quick Setup

### Option 1: Web3.Storage (Recommended - Free)

1. **Sign up** at [https://web3.storage/](https://web3.storage/)
2. **Create an account** (free tier available)
3. **Generate an API token**:
   - Go to Account → API Tokens
   - Click "Create API Token"
   - Copy the token
4. **Add to your `.env.local` file**:
   ```bash
   NEXT_PUBLIC_WEB3_STORAGE_TOKEN=your_token_here
   ```

### Option 2: Pinata (Alternative)

1. **Sign up** at [https://app.pinata.cloud/](https://app.pinata.cloud/)
2. **Create an account** (free tier available)
3. **Generate a JWT**:
   - Go to API Keys
   - Create a new key
   - Copy the JWT
4. **Add to your `.env.local` file**:
   ```bash
   NEXT_PUBLIC_PINATA_JWT=your_jwt_here
   ```

## Environment Variables

Create a `.env.local` file in your project root with:

```bash
# Choose ONE IPFS provider:

# Web3.Storage (Recommended)
NEXT_PUBLIC_WEB3_STORAGE_TOKEN=your_token_here

# OR Pinata
NEXT_PUBLIC_PINATA_JWT=your_jwt_here
```

## How It Works

The IPFS utilities automatically:
1. **Try Web3.Storage first** (if `NEXT_PUBLIC_WEB3_STORAGE_TOKEN` is set)
2. **Fall back to Pinata** (if `NEXT_PUBLIC_PINATA_JWT` is set)
3. **Show helpful error** if neither is configured

## Testing Your Setup

After configuring your IPFS provider, test it by:

1. Creating a new job - the metadata should upload to IPFS
2. Submitting work - the preview image should upload to IPFS
3. Check the browser console for IPFS upload logs

## Troubleshooting

### Error: "IPFS storage not configured"

**Solution**: Add one of the IPFS provider tokens to your `.env.local` file and restart your dev server.

### Error: "IPFS upload failed: 401 Unauthorized"

**Solution**: Your API token/JWT is invalid or expired. Generate a new one from your provider's dashboard.

### Error: "IPFS upload failed: 403 Forbidden"

**Solution**: Check your API token permissions. Make sure it has upload/pin permissions.

### Files not persisting

**Solution**: Make sure you're using a paid tier or have sufficient quota. Free tiers may have limitations.

## Free Tier Limits

### Web3.Storage
- **Free**: 5 GB storage, 1 GB/day upload limit
- Perfect for development and small projects

### Pinata
- **Free**: 1 GB storage, 100 files
- Good for testing and small projects

## Production Recommendations

For production use:
1. **Use a paid tier** for better reliability
2. **Set up multiple providers** for redundancy
3. **Monitor your usage** to avoid hitting limits
4. **Consider self-hosting** IPFS nodes for enterprise use

## Need Help?

- Web3.Storage Docs: https://web3.storage/docs/
- Pinata Docs: https://docs.pinata.cloud/
- BlockPay Issues: Check the main README for support channels


