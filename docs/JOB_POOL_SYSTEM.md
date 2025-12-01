# BlockPay Job Pool System

Complete production-ready Job Pool system integrated with Intuition Knowledge Graph.

## Overview

The Job Pool system enables requestors to post jobs with TRUST token escrow, creators to submit work, and automatic reputation tracking through Intuition's Knowledge Graph.

## Architecture

### Components

1. **Smart Contract** (`contracts/JobPool.sol`)
   - Escrow management in TRUST tokens
   - Multi-submission support
   - Approve/Reject/Cancel/Dispute flows
   - Platform fee collection
   - Role-based access control

2. **React Hooks** (`hooks/useJobPool.ts`)
   - Wagmi/Viem integration
   - Job creation, submission, approval
   - Intuition atom creation
   - IPFS upload helpers

3. **React Components** (`components/jobs/`)
   - `JobCreateForm` - Create new jobs
   - `JobList` - Browse all jobs
   - `JobDetail` - View job and submissions
   - `SubmissionForm` - Submit work for jobs

4. **Indexer Service** (`lib/indexer/jobPoolIndexer.ts`)
   - Listens to contract events
   - Creates Intuition Triples
   - Updates reputation scores

5. **IPFS Utilities** (`lib/ipfs.ts`)
   - Upload job metadata
   - Upload submission previews
   - Support for web3.storage and Pinata

## Setup

### 1. Environment Variables

Add to your `.env.local`:

```bash
# Job Pool Contract Address (after deployment)
NEXT_PUBLIC_JOB_POOL_ADDRESS=0x...

# TRUST Token Address
NEXT_PUBLIC_TRUST_TOKEN_ADDRESS=0x...

# IPFS Provider (choose one)
NEXT_PUBLIC_WEB3_STORAGE_TOKEN=your_token_here
# OR
NEXT_PUBLIC_PINATA_JWT=your_jwt_here

# Indexer Configuration (for indexer service)
RPC_URL=https://rpc.testnet.intuition.sh
CHAIN_ID=13579
```

### 2. Deploy Contract

```bash
# Using Hardhat or your preferred tool
npx hardhat deploy --network intuition-testnet
```

The contract constructor requires:
- `_trust`: TRUST token address
- `_treasury`: Treasury address for fee collection
- `_platformFeeBps`: Platform fee in basis points (e.g., 250 = 2.5%)

### 3. Run Indexer

The indexer service listens to contract events and creates Triples in Intuition:

```bash
# Install dependencies
npm install

# Run indexer
npx ts-node lib/indexer/jobPoolIndexer.ts

# Or use PM2 for production
pm2 start lib/indexer/jobPoolIndexer.ts --name jobpool-indexer
```

## Usage

### Creating a Job

1. Navigate to `/jobs` page
2. Click "Create Job"
3. Fill in job details:
   - Title
   - Description
   - Category
   - Budget (in TRUST)
   - Deadline (optional)
   - Requirements
4. Submit - the system will:
   - Upload metadata to IPFS
   - Create a Job atom in Intuition
   - Create the job on-chain with escrow

### Submitting Work

1. Browse jobs on `/jobs` page
2. Click on a job to view details
3. Click "Submit Work"
4. Upload preview image
5. Add description (optional)
6. Submit - the system will:
   - Upload preview to IPFS
   - Create Submission atom in Intuition
   - Submit on-chain

### Approving Work

1. As requestor, view job details
2. Review submissions
3. Click "Approve & Pay" on a submission
4. Creator receives payout (budget - platform fee)
5. Indexer creates Triple: `[jobAtom] --[completedBy]--> [creatorProfile]`

## Intuition Integration

### Atoms Created

- **Job Atom**: Contains job metadata (title, description, budget, etc.)
- **Submission Atom**: Contains submission data (preview CID, description)

### Triples Created

The indexer automatically creates these Triples:

1. `[requestorProfile] --[postedJob]--> [jobAtom]`
2. `[submissionAtom] --[submittedTo]--> [jobAtom]`
3. `[submitterProfile] --[submitted]--> [submissionAtom]`
4. `[jobAtom] --[completedBy]--> [creatorProfile]` (on approval)

### Trust Signals

On job approval, the indexer can submit trust votes via Multivote contract to update reputation scores based on:
- Job completion
- Payment amount
- Requestor satisfaction

## Security Considerations

1. **Reentrancy Protection**: All state-changing functions use `nonReentrant`
2. **Access Control**: Admin and Operator roles for sensitive operations
3. **Pull Pattern**: Withdrawable balances prevent reentrancy issues
4. **SafeERC20**: All token transfers use SafeERC20
5. **Input Validation**: Deadlines, budgets, and statuses are validated

## Gas Optimization

- Minimal on-chain storage (only IDs and essential data)
- IPFS for large metadata
- Batch event processing in indexer
- Efficient status checks

## Monitoring

### Key Metrics

- Total jobs created
- Active jobs (Open/Submitted)
- Total TRUST escrowed
- Platform fees collected
- Average time to approval
- Submission acceptance rate

### Events to Monitor

- `JobCreated` - Track new jobs
- `SubmissionCreated` - Track submissions
- `JobApproved` - Track completions
- `JobCancelled` - Track cancellations
- `JobDisputed` - Track disputes

## Testing Checklist

- [ ] Create job with valid budget
- [ ] Create job with insufficient TRUST balance
- [ ] Submit work to open job
- [ ] Submit work to closed job (should fail)
- [ ] Approve submission (check payout)
- [ ] Cancel job (check refund)
- [ ] Dispute job
- [ ] Operator resolve dispute
- [ ] Withdraw balance
- [ ] Indexer creates Triples correctly

## Future Enhancements

1. **Multi-winner jobs**: Support multiple approved submissions
2. **Milestone payments**: Pay in stages
3. **Rating system**: Requestor rates creator work
4. **Escalation**: Automated dispute resolution
5. **Job templates**: Pre-defined job types
6. **Search & filters**: Advanced job discovery
7. **Notifications**: Real-time updates via push notifications

## Support

For issues or questions:
- Check contract events on block explorer
- Review indexer logs
- Verify Intuition atom creation
- Check IPFS uploads

## License

MIT


