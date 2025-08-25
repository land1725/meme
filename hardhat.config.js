require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // 本地网络配置
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // sepolia 测试网络配置
    sepolia: {
      url: process.env.SEPOLIA_URL || "",
      accounts: [process.env.PRIVATE_KEY_1, process.env.PRIVATE_KEY_2],
      chainId: 11155111,
    }
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
