import * as ethers from "ethers";
import * as solana from "@solana/web3.js";
import { ChainId, EVMChainId } from "@certusone/wormhole-sdk";
import * as winston from "winston";
/*
 *  Config
 */

// todo: Should these really be in this package? Probably shouldn't since plugins shouldn't depend on all these

// subset of common env that plugins should have access to
export interface CommonPluginEnv {
  envType: EnvType;
  supportedChains: ChainConfigInfo[];
}

export enum EnvType {
  MAINNET = "MAINNET",
  DEVNET = "DEVNET",
  TILT = "TILT",
  LOCALHOST = "LOCALHOST",
  OTHER = "OTHER",
}

export type ChainConfigInfo = {
  chainId: ChainId;
  chainName: string;
  nativeCurrencySymbol: string;
  nodeUrl: string;
  tokenBridgeAddress?: string;
  bridgeAddress?: string;
  terraName?: string;
  terraChainId?: string;
  terraCoin?: string;
  terraGasPriceUrl?: string;
  wrappedAsset?: string | null;
  isTerraClassic?: boolean;
};

/*
 * Storage
 */

export interface Workflow<D = any> {
  id: ActionId;
  pluginName: string;
  data: D;
}

export interface ActionExecutor {
  <T, W extends Wallet>(action: Action<T, W>): Promise<T>;
  onSolana<T>(f: ActionFunc<T, SolanaWallet>): Promise<T>;
  onEVM<T>(action: Action<T, EVMWallet>): Promise<T>;
}

export type ActionFunc<T, W extends Wallet> = (
  walletToolBox: WalletToolBox<W>,
  chaidId: ChainId
) => Promise<T>;

export interface Action<T, W extends Wallet> {
  chainId: ChainId;
  f: ActionFunc<T, W>;
}

export type ActionId = number; // todo: UUID
export type WorkflowId = number; // todo: UUID

export type StagingArea = Object; // Next action to be executed
/*
 * Wallets and Providers
 */

export type EVMWallet = ethers.Signer & { address: string };
export type Wallet = EVMWallet | SolanaWallet | CosmWallet;

export interface WalletToolBox<T extends Wallet> extends Providers {
  wallet: T;
}

export type SolanaWallet = {
  conn: solana.Connection;
  payer: solana.Keypair;
};

export type CosmWallet = {};

export interface Providers {
  evm: { [id in EVMChainId]: ethers.providers.Provider };
  solana: solana.Connection;
  // todo: rest of supported chain providers
}

/*
 *  Plugin interfaces
 */

export interface Plugin<WorkflowData = any> {
  pluginName: string; // String identifier for plug-in
  pluginConfig: any; // Configuration settings for plug-in
  shouldSpy: boolean; // Boolean toggle if relayer should connect to Guardian Network via non-validation guardiand node
  shouldRest: boolean; // Boolean toggle if relayer should connect to Guardian Network via REST API
  demoteInProgress?: boolean;
  getFilters(): ContractFilter[]; // List of emitter addresses and emiiter chain ID to filter for
  consumeEvent( // Function to be defined in plug-in that takes as input a VAA and outputs a list of actions
    vaa: Buffer,
    stagingArea: StagingArea,
    providers: Providers
  ): Promise<{ workflowData?: WorkflowData; nextStagingArea: StagingArea }>;
  handleWorkflow(
    workflow: Workflow<WorkflowData>,
    providers: Providers,
    execute: ActionExecutor
  ): Promise<void>;
}

export interface PluginFactory {
  // validate untyped config and exception out if invalid
  create(
    config: CommonPluginEnv,
    pluginEnv: Record<string, any>,
    logger: winston.Logger
  ): Plugin;
  // plugin name
  pluginName: string;
}

export type ContractFilter = {
  emitterAddress: string; // Emitter contract address to filter for
  chainId: ChainId; // Wormhole ChainID to filter for
};