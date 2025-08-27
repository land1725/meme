require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  // 全局 gas 配置，适用于所有网络
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
  },
  // 默认 gas 配置
  defaultNetwork: "hardhat",
  networks: {
    // 本地网络配置
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      gas: 3000000, // 统一 gas limit
      gasPrice: "auto", // 自动估算 gas price
    },
    // sepolia 测试网络配置
    sepolia: {
      url: process.env.SEPOLIA_URL || "https://rpc.sepolia.org",
      accounts: [process.env.PRIVATE_KEY_1, process.env.PRIVATE_KEY_2, process.env.PRIVATE_KEY_3, process.env.PRIVATE_KEY_4].filter(key => key !== undefined),
      chainId: 11155111,
      gas: 3000000, // 统一 gas limit
      // 高速配置 - 优先使用 EIP-1559（更快更准确）
      maxFeePerGas: 100000000000,        // 100 gwei - 确保快速确认
      maxPriorityFeePerGas: 10000000000, // 10 gwei - 给矿工的小费
      // 备用传统配置（如果 EIP-1559 不支持）
      gasPrice: 80000000000, // 80 gwei - 高于平均值确保快速打包
      timeout: 300000, // 5分钟超时，与测试超时匹配
      blockConfirmations: 1, // 减少确认等待时间
    },
    // sepolia 极速配置（最快速度，成本较高）
    "sepolia-fast": {
      url: process.env.SEPOLIA_URL || "https://rpc.sepolia.org",
      accounts: [process.env.PRIVATE_KEY_1, process.env.PRIVATE_KEY_2, process.env.PRIVATE_KEY_3, process.env.PRIVATE_KEY_4].filter(key => key !== undefined),
      chainId: 11155111,
      gas: 3000000,
      // 极速配置 - 几乎保证下一个块就被包含
      maxFeePerGas: 200000000000,        // 200 gwei
      maxPriorityFeePerGas: 50000000000, // 50 gwei 高优先费
      gasPrice: 150000000000, // 150 gwei 备用
      timeout: 300000,
      blockConfirmations: 1,
    },
    // sepolia 的保守配置（如果需要便宜的gas）
    "sepolia-conservative": {
      url: process.env.SEPOLIA_URL || "https://rpc.sepolia.org",
      accounts: [process.env.PRIVATE_KEY_1, process.env.PRIVATE_KEY_2, process.env.PRIVATE_KEY_3, process.env.PRIVATE_KEY_4].filter(key => key !== undefined),
      chainId: 11155111,
      gas: 3000000,
      gasPrice: 30000000000, // 30 gwei 固定价格，确保交易能够被包含
      timeout: 300000,
      blockConfirmations: 1,
    }
  },
  // Mocha 测试配置
  mocha: {
    timeout: 300000, // 5分钟超时，与测试文件中的设置一致
  },
  // 自定义测试 gas 配置（可在测试中通过 hre.config.testGasSettings 访问）
  testGasSettings: {
    defaultGasLimit: 3000000,
    failureTestGasLimit: 100000, // 用于预期失败的交易
    conservativeGasLimit: 150000, // 用于更保守的失败测试
  },
  namedAccounts: {
    deployer: {
      default: 0, // 默认使用第一个账户作为部署者
      localhost: 0, // 在 localhost 网络使用第一个账户
      sepolia: 0, // 在 sepolia 网络使用第一个账户
    },
    user1: 1, // 第二个账户
    user2: 2, // 第三个账户
  },
  etherscan: { 
    apiKey: process.env.ETHERSCAN_API_KEY 
  }
};
