# BlockPay

## 1. Abstract

BlockPay is a decentralized job marketplace designed for content creators, designers, builders, and artists. Built on top of Intuition's Knowledge Graph, it leverages on-chain trust, reputation, and programmable payments to create a transparent, verifiable ecosystem where creativity meets trust.

Creators can showcase and monetize their works with verifiable ownership, while clients can hire top-ranked talents through trust-based scoring derived from real contributions and votes in the Intuition network.

## 2. Problem

Traditional creative marketplaces such as Fiverr, Upwork, or Behance are centralized, opaque, and lack verifiable reputation systems.

These platforms:

- Enforce high platform fees (10–20%)
- Retain custody of user data and payouts
- Do not provide verifiable or portable reputation
- Lack transparency in ranking and payment distribution
- Fail to protect intellectual property (IP) for artists

There is a need for a trust-anchored decentralized alternative where creative work, reputation, and payment are provable, transparent, and owned by the users.

## 3. Vision

BlockPay aims to redefine how digital creators, designers, builders, and artists collaborate by introducing trust-based identity and verifiable work credentials. By embedding Intuition's trust graph into the marketplace, BlockPay transforms reputation into a programmable asset, allowing talent and trust to compound naturally through transparent on-chain interactions.

## 4. Core Concepts

### 4.1 Trust Graph Reputation

- Every creator and user is an Atom in the Intuition Knowledge Graph.
- Relationships like "created," "trusted by," or "completed job for" are stored as Triples in the graph.
- Votes and reputation changes are powered by Intuition's Multivote Contracts.
- Each vote contributes to a creator's trust score and shares, determining ranking and eligibility for new jobs.

### 4.2 The TRUST Token

TRUST is the native token used across BlockPay for:

- Payments and escrow
- Voting and staking trust
- Rewarding verified work
- Access to high-value job pools

The TRUST token economy incentivizes fair play, reputation building, and long-term engagement.

### 4.3 Provenance-Anchored Creativity

- Every uploaded artwork, design, or media is minted as an Artwork Atom linked to the creator.
- Watermarked low-resolution previews are publicly visible; high-resolution assets are only unlocked after payment confirmation.
- Each sale emits a verifiable ownership signal into the graph.

### 4.4 The Public Job Pool

A decentralized task board where users post jobs such as "I want a hand-drawn cat PFP for 50 TRUST."

- Artists submit watermarked previews before job approval.
- Upon approval, escrow releases payment to the creator, and the buyer gains access to the full-resolution work.
- All interactions are recorded in the knowledge graph for provenance and future reputation weighting.
