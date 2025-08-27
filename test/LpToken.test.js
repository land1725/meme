const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LpToken", function () {
  let LpToken, lpToken, MemeToken, memeToken;
  let owner, user1, user2, user3;
  const INITIAL_SUPPLY = ethers.utils.parseEther("1000000"); // 100万代币
  const MEME_AMOUNT = ethers.utils.parseEther("1000"); // 1000个代币用于测试
  const ETH_AMOUNT = ethers.utils.parseEther("1"); // 1 ETH用于测试

  before(async function () {
    // 获取测试账户
    [owner, user1, user2, user3] = await ethers.getSigners();
    console.log("测试账户地址:", {
      owner: owner.address,
      user1: user1.address,
      user2: user2.address,
      user3: user3.address
    });

    // 部署 MemeToken 合约
    MemeToken = await ethers.getContractFactory("MemeToken");
    memeToken = await MemeToken.deploy(owner.address, owner.address); // 传入两个参数
    await memeToken.deployed();
    console.log("MemeToken 部署地址:", memeToken.address);

    // 部署 LpToken 合约 (使用 LiquidityPoolManager.sol 中的 LpToken 合约)
    LpToken = await ethers.getContractFactory("LpToken");
    lpToken = await LpToken.deploy(owner.address, memeToken.address);
    await lpToken.deployed();
    console.log("LpToken 部署地址:", lpToken.address);

    // 给测试用户一些 MemeToken
    await memeToken.transfer(user1.address, MEME_AMOUNT.mul(10));
    await memeToken.transfer(user2.address, MEME_AMOUNT.mul(5));
    console.log("代币分发完成");
  });

  describe("部署检查", function () {
    it("应该正确设置合约参数", async function () {
      expect(await lpToken.name()).to.equal("LpToken");
      expect(await lpToken.symbol()).to.equal("LP");
      expect(await lpToken.owner()).to.equal(owner.address);
    });

    it("应该初始化为空流动性池", async function () {
      expect(await lpToken.totalSupply()).to.equal(0);
    });
  });

});
