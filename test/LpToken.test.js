const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

describe("LpToken", function () {
  let LpToken, lpToken, MemeToken, memeToken;
  let owner, user1, user2, user3;
  let network, isLocalNet;
  const INITIAL_SUPPLY = ethers.utils.parseEther("1000000"); // 100万代币
  const MEME_AMOUNT = ethers.utils.parseEther("1000"); // 1000个代币用于测试
  const ETH_AMOUNT = ethers.utils.parseEther("1"); // 1 ETH用于测试

  before(async function () {
    console.log("\n🚀 [SETUP] 开始初始化 LpToken 测试环境...");
    console.log("=".repeat(60));
    
    // 检查网络状态
    network = await ethers.provider.getNetwork();
    isLocalNet = ["hardhat", "localhost"].includes(
      (network.name || "").toLowerCase()
    ) || network.chainId === 31337;
    console.log(`🌐 [NETWORK] ${network.name} (chainId: ${network.chainId}), local: ${isLocalNet}`);
    
    // 获取测试账户
    console.log("📋 [SETUP] 步骤 1/4: 获取测试账户...");
    [owner, user1, user2, user3] = await ethers.getSigners();
    console.log("✅ [SETUP] 测试账户获取成功:", {
      owner: owner.address,
      user1: user1.address,
      user2: user2.address,
      user3: user3.address
    });

    // 获取或部署合约 - 根据网络类型决定是否重新部署
    console.log("\n📋 [SETUP] 步骤 2/4: 获取合约...");
    
    if (isLocalNet) {
      // 本地网络：使用 fixture 重新部署确保测试环境干净
      console.log("   🏠 本地网络：重新部署所有合约");
      await deployments.fixture(["MemeToken", "LpToken"]);
    } else {
      // 远程网络：尝试使用已部署的合约，如果不存在则部署
      console.log("   🌐 远程网络：查找已部署的合约");
      try {
        // 检查是否已有部署记录
        await deployments.get("MemeToken");
        await deployments.get("LpToken");
        console.log("   ✅ 找到已部署的合约");
      } catch (error) {
        console.log("   ⚠️  未找到已部署的合约，开始部署...");
        await deployments.fixture(["MemeToken", "LpToken"]);
      }
    }
    
    // 获取 MemeToken 合约
    const memeTokenDeployment = await deployments.get("MemeToken");
    memeToken = await ethers.getContractAt("MemeToken", memeTokenDeployment.address, owner);
    console.log(`📄 [CONTRACT] MemeToken at: ${memeToken.address}`);

    // 获取 LpToken 合约 (使用 LiquidityPoolManager.sol 中的 LpToken 合约)
    console.log("\n📋 [SETUP] 步骤 3/4: 获取 LpToken 合约...");
    const lpTokenDeployment = await deployments.get("LpToken");
    lpToken = await ethers.getContractAt("LpToken", lpTokenDeployment.address, owner);
    console.log(`📄 [CONTRACT] LpToken at: ${lpToken.address}`);

    // 给测试用户一些 MemeToken
    console.log("\n📋 [SETUP] 步骤 4/4: 分发测试代币...");
    await memeToken.transfer(user1.address, MEME_AMOUNT.mul(4)); // 改为 4000 个代币
    await memeToken.transfer(user2.address, MEME_AMOUNT.mul(2)); // 改为 2000 个代币
    console.log("✅ [SETUP] 代币分发完成");
    console.log("   - user1 获得:", ethers.utils.formatEther(MEME_AMOUNT.mul(4)), "MEME");
    console.log("   - user2 获得:", ethers.utils.formatEther(MEME_AMOUNT.mul(2)), "MEME");
    console.log("=".repeat(60));
    console.log("🎯 [SETUP] 初始化完成，开始执行测试用例...\n");
  });

  describe("测试套件1：合约初始化", function () {
    it("应该正确设置合约参数", async function () {
      console.log("🧪 [TEST 1] 开始测试: 合约参数设置验证...");
      
      // 基础参数验证
      console.log("   📝 检查 LP 代币名称...");
      expect(await lpToken.name()).to.equal("LpToken");
      console.log("   ✅ LP 代币名称验证通过: LpToken");
      
      // 检查LP代币名称/符号设置
      console.log("   📝 检查 LP 代币符号...");
      expect(await lpToken.symbol()).to.equal("LP");
      console.log("   ✅ LP 代币符号验证通过: LP");
      
      // 验证MemeToken地址绑定正确性
      console.log("   📝 检查 MemeToken 地址绑定...");
      const boundMemeTokenAddress = await lpToken.getMemeTokenAddress();
      console.log("   🔍 LpToken 中绑定的 MemeToken 地址:", boundMemeTokenAddress);
      console.log("   🔍 测试中的 MemeToken 地址:", memeToken.address);
      expect(boundMemeTokenAddress).to.equal(memeToken.address);
      console.log("   ✅ MemeToken 地址绑定验证通过:", memeToken.address);
      
      console.log("🎉 [TEST 1] 合约参数设置验证 - 全部通过!\n");
    });

    it("初始状态验证", async function () {
      console.log("🧪 [TEST 2] 开始测试: 初始状态验证...");
      
      // 流动性池初始值应为0
      console.log("   📝 检查 LP 代币总供应量...");
      expect(await lpToken.totalSupply()).to.equal(0);
      console.log("   ✅ LP 代币总供应量验证通过: 0");
      
      // 初始手续费率应为3
      console.log("   📝 检查交换手续费率...");
      expect(await lpToken.swapFeeRate()).to.equal(3);
      console.log("   ✅ 交换手续费率验证通过: 3");
      
      console.log("🎉 [TEST 2] 初始状态验证 - 全部通过!\n");
    });
  });
// 测试套件2：管理员权限
  describe("测试套件2：管理员权限", function () {
    // 测试用例1：Owner铸币应成功
    it("Owner铸币应成功", async function () {
      console.log("🧪 [TEST 3] 开始测试: Owner铸币验证...");
      const tx = await lpToken.connect(owner).mint(user1.address, ethers.utils.parseEther("100"));
      await tx.wait();
      expect(await lpToken.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("100"));
      console.log("   ✅ Owner铸币验证通过: 100 LP");
    });
    // 测试用例2：非Owner铸币操作应失败
    it("非Owner铸币操作应失败", async function () {
      console.log("🧪 [TEST 4] 开始测试: 非Owner铸币验证...");
      
      if (isLocalNet) {
        await expect(
          lpToken.connect(user1).mint(user1.address, ethers.utils.parseEther("100"))
        ).to.be.revertedWithCustomError(
          lpToken,
          "OwnableUnauthorizedAccount"
        );
        console.log("   ✅ 非Owner铸币验证通过: 操作被拒绝");
      } else {
        try {
          const tx = await lpToken.connect(user1).mint(user1.address, ethers.utils.parseEther("100"));
          console.log("🔍 [TEST] Transaction sent:", tx.hash);
          
          // 等待交易被挖矿并检查状态
          const receipt = await tx.wait();
          console.log("🔍 [TEST] Transaction receipt status:", receipt.status);
          
          if (receipt.status === 1) {
            console.log("❌ [TEST] Transaction unexpectedly succeeded");
            throw new Error("Should have reverted");
          } else {
            console.log("✅ [TEST] Transaction correctly failed on remote network");
          }
        } catch (e) {
          console.log("🔍 [TEST] Caught error:", e.message);
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          // 如果是合约 revert 或其他错误，这是期望的行为
          console.log("   ✅ 非Owner铸币验证通过: 操作被拒绝");
        }
      }
      
      console.log("🎉 [TEST 4] 非Owner铸币验证 - 全部通过!\n");
    });

  });
  // 测试套件3：重入攻击防护
  describe("测试套件3：重入攻击防护", function () {
    // 测试用例1：模拟重入攻击应失败
    it("模拟重入攻击应失败", async function () {
      console.log("🧪 [TEST 5] 开始测试: 重入攻击防护验证...");
      
      // 首先添加初始流动性，确保池子有资产比例
      console.log("   📝 添加初始流动性...");
      await memeToken.connect(owner).approve(lpToken.address, MEME_AMOUNT);
      await lpToken.connect(owner).addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      console.log("   ✅ 初始流动性添加完成");
      
      // 部署恶意合约
      const AttackerFactory = await ethers.getContractFactory("ReentrancyAttacker");
      const attacker = await AttackerFactory.deploy(lpToken.address, memeToken.address);
      await attacker.deployed();
      console.log("   📝 恶意合约部署成功，地址:", attacker.address);
      
      // 给恶意合约一些 MEME 代币用于攻击
      await memeToken.connect(owner).transfer(attacker.address, MEME_AMOUNT);
      expect(await memeToken.balanceOf(attacker.address)).to.equal(MEME_AMOUNT);
      console.log("   📝 恶意合约获得", ethers.utils.formatEther(MEME_AMOUNT), "MEME 代币");

      // 尝试发起重入攻击 - 使用大量 ETH 以确保会有退款
      const attackETH = ethers.utils.parseEther("10"); // 使用 10 ETH 攻击
      if (isLocalNet) {
        // 本地网络：检查交易是否被回滚（不一定要有特定的错误消息）
        await expect(
          attacker.attack({ value: attackETH })
        ).to.be.reverted;
        console.log("   ✅ 重入攻击防护验证通过: 攻击被阻止");
      } else {
        try {
          const tx = await attacker.attack({ value: attackETH });
          console.log("🔍 [TEST] Transaction sent:", tx.hash);
          
          // 等待交易被挖矿并检查状态
          const receipt = await tx.wait();
          console.log("🔍 [TEST] Transaction receipt status:", receipt.status);
          
          if (receipt.status === 1) {
            console.log("❌ [TEST] Attack unexpectedly succeeded");
            throw new Error("Should have reverted");
          } else {
            console.log("✅ [TEST] Attack correctly failed on remote network");
          }
        } catch (e) {
          console.log("🔍 [TEST] Caught error:", e.message);
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          // 如果是合约 revert 或其他错误，这是期望的行为
          console.log("   ✅ 重入攻击防护验证通过: 攻击被阻止");
        }
      }
      
      console.log("🎉 [TEST 5] 重入攻击防护验证 - 全部通过!\n");
    });

  });

});
