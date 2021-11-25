const ethers = require("ethers");
const { Command } = require("commander");
const constants = require("../constants");
const { setupParentArgs, splitCommaList, isValidAddress } = require("./utils");

const deployCmd = new Command("deploy")
  .description("Deploys contracts via RPC")
  .option(
    "--chainId <value>",
    "Chain ID for the instance",
    constants.DEFAULT_SOURCE_ID
  )
  .option(
    "--relayers <value>",
    "List of initial relayers",
    splitCommaList,
    constants.relayerAddresses
  )
  .option(
    "--relayerThreshold <value>",
    "Number of votes required for a proposal to pass",
    2
  )
  .option(
    "--fee <ether>",
    "Fee to be taken when making a deposit (decimals allowed)",
    0
  )
  .option(
    "--expiry <blocks>",
    "Numer of blocks after which a proposal is considered cancelled",
    100
  )
  .option("--all", "Deploy all contracts")
  .option("--bridge", "Deploy bridge contract")
  .option("--erc20Handler", "Deploy erc20Handler contract")
  .option("--genericHandler", "Deploy genericHandler contract")
  .option(
    "--bridgeAddress <address>",
    "Bridge contract address for independent handler deployment",
    ""
  )
  .option("--erc20", "Deploy erc20 contract")
  .option("--erc20Symbol <symbol>", "Name for the erc20 contract", "")
  .option("--erc20Name <name>", "Symbol for the erc20 contract", "")
  .option("--erc20Decimals <amount>", "Decimals for erc20 contract", 18)
  .option("--asset", "Deploy chain asset contract")
  .option("--config", "Logs the configuration based on the deployment", false)
  .action(async (args) => {
    await setupParentArgs(args, args.parent);
    let startBal = await args.provider.getBalance(args.wallet.address);
    console.log("Deploying contracts...");
    if (args.all) {
      await deployBridgeContract(args);
      await deployERC20Handler(args);
      await deployGenericHandler(args);
      await deployERC20(args);
    } else {
      let deployed = false;
      if (args.bridge) {
        await deployBridgeContract(args);
        deployed = true;
      }
      if (args.erc20Handler) {
        await deployERC20Handler(args);
        deployed = true;
      }
      if (args.genericHandler) {
        await deployGenericHandler(args);
        deployed = true;
      }
      if (args.erc20) {
        await deployERC20(args);
        deployed = true;
      }
      if (args.asset) {
        await deployAssetStore(args);
        deployed = true;
      }
      if (!deployed) {
        throw new Error("must specify --all or specific contracts to deploy");
      }
    }

    args.cost = startBal.sub(
      await args.provider.getBalance(args.wallet.address)
    );
    displayLog(args);
    if (args.config) {
      createConfig(args);
    }
  });

const createConfig = (args) => {
  const config = {};
  config.name = "eth";
  config.chainId = args.chainId;
  config.endpoint = args.url;
  config.bridge = args.bridgeAddress;
  config.erc20Handler = args.erc20HandlerContract;
  config.genericHandler = args.genericHandlerContract;
  config.gasLimit = args.gasLimit.toNumber();
  config.maxGasPrice = args.gasPrice.toNumber();
  config.startBlock = "0";
  config.http = "false";
  config.relayers = args.relayers;
  const data = JSON.stringify(config, null, 4);
  console.log(
    "EVM Configuration, please copy this into your ChainBridge config file:"
  );
  console.log(data);
};

const displayLog = (args) => {
  console.log(`
================================================================
Url:        ${args.url}
Deployer:   ${args.wallet.address}
Gas Limit:   ${ethers.utils.bigNumberify(args.gasLimit)}
Gas Price:   ${ethers.utils.bigNumberify(args.gasPrice)}
Deploy Cost: ${ethers.utils.formatEther(args.cost)}

Options
=======
Chain Id:    ${args.chainId}
Threshold:   ${args.relayerThreshold}
Relayers:    ${args.relayers}
Bridge Fee:  ${args.fee}
Expiry:      ${args.expiry}

Contract Addresses
================================================================
Bridge:             ${args.bridgeAddress ? args.bridgeAddress : "Not Deployed"}
----------------------------------------------------------------
Erc20 Handler:      ${
    args.erc20HandlerContract ? args.erc20HandlerContract : "Not Deployed"
  }
----------------------------------------------------------------
Generic Handler:    ${
    args.genericHandlerContract ? args.genericHandlerContract : "Not Deployed"
  }
----------------------------------------------------------------
Erc20:              ${args.erc20Contract ? args.erc20Contract : "Not Deployed"}
----------------------------------------------------------------
Chain Asset:   ${
    args.ChainAssetContract ? args.ChainAssetContract : "Not Deployed"
  }
================================================================
        `);
};

async function deployBridgeContract(args) {
  // Create an instance of a Contract Factory
  let factory = new ethers.ContractFactory(
    constants.ContractABIs.Bridge.abi,
    constants.ContractABIs.Bridge.bytecode,
    args.wallet
  );

  // Deploy
  let contract = await factory.deploy(
    args.chainId,
    args.relayers,
    args.relayerThreshold,
    ethers.utils.parseEther(args.fee.toString()),
    args.expiry,
    { gasPrice: args.gasPrice, gasLimit: args.gasLimit }
  );
  await contract.deployed();
  args.bridgeAddress = contract.address;
  console.log("✓ Bridge contract deployed");
}

async function deployERC20(args) {
  const factory = new ethers.ContractFactory(
    constants.ContractABIs.Erc20Mintable.abi,
    constants.ContractABIs.Erc20Mintable.bytecode,
    args.wallet
  );
  const contract = await factory.deploy(
    args.erc20Name,
    args.erc20Symbol,
    args.erc20Decimals,
    { gasPrice: args.gasPrice, gasLimit: args.gasLimit }
  );
  await contract.deployed();
  args.erc20Contract = contract.address;
  console.log("✓ ERC20 contract deployed");
}

async function deployERC20Handler(args) {
  if (!isValidAddress(args.bridgeAddress)) {
    console.log(
      "ERC20Handler contract failed to deploy due to invalid bridge address"
    );
    return;
  }
  const factory = new ethers.ContractFactory(
    constants.ContractABIs.Erc20Handler.abi,
    constants.ContractABIs.Erc20Handler.bytecode,
    args.wallet
  );
  const contract = await factory.deploy(args.bridgeAddress, [], [], [], {
    gasPrice: args.gasPrice,
    gasLimit: args.gasLimit,
  });
  await contract.deployed();
  args.erc20HandlerContract = contract.address;
  console.log("✓ ERC20Handler contract deployed");
}

async function deployGenericHandler(args) {
  if (!isValidAddress(args.bridgeAddress)) {
    console.log(
      "GenericHandler contract failed to deploy due to invalid bridge address"
    );
    return;
  }
  const factory = new ethers.ContractFactory(
    constants.ContractABIs.GenericHandler.abi,
    constants.ContractABIs.GenericHandler.bytecode,
    args.wallet
  );
  const contract = await factory.deploy(args.bridgeAddress, [], [], [], [], {
    gasPrice: args.gasPrice,
    gasLimit: args.gasLimit,
  });
  await contract.deployed();
  args.genericHandlerContract = contract.address;
  console.log("✓ GenericHandler contract deployed");
}

async function deployAssetStore(args) {
  const factory = new ethers.ContractFactory(
    constants.ContractABIs.ChainAsset.abi,
    constants.ContractABIs.ChainAsset.bytecode,
    args.wallet
  );
  const contract = await factory.deploy({
    gasPrice: args.gasPrice,
    gasLimit: args.gasLimit,
  });
  await contract.deployed();
  args.ChainAssetContract = contract.address;
  console.log("✓ ChainAsset contract deployed");
}

module.exports = deployCmd;