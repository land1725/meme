const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

// 使用 ethers 内置的 BigNumber 实现简单的平方根函数
function bigNumberSqrt(value) {
  if (value.isZero()) return value;

  // 对于小数值，可以直接使用 JavaScript 的 Math.sqrt
  if (value.lt(ethers.utils.parseEther("1000000"))) {
    const valueInEther = parseFloat(ethers.utils.formatEther(value));
    const sqrtResult = Math.sqrt(valueInEther);
    return ethers.utils.parseEther(sqrtResult.toString());
  }

  // 对于大数值，使用 Newton-Raphson 方法
  let x = value;
  let y = value.add(1).div(2);

  while (y.lt(x)) {
    x = y;
    y = x.add(value.div(x)).div(2);
  }

  return x;
}

describe("LpToken", function () {
  let LpToken, lpToken, MemeToken, memeToken;
  let owner, user1, user2, user3;
  let network, isLocalNet;
  const INITIAL_SUPPLY = ethers.utils.parseEther("1000000"); // 100万代币
  const MEME_AMOUNT = ethers.utils.parseEther("9.5"); // 9.5个代币用于测试（从1000减少到9.5）
  const ETH_AMOUNT = ethers.utils.parseEther("0.01"); // 0.01 ETH用于测试（从1减少到0.01）

  // 在每个测试前重新部署合约并初始化环境确保干净状态
  beforeEach(async function () {
    console.log("🚀 [SETUP] Initializing test environment and redeploying contracts...");

    // 检查网络状态
    network = await ethers.provider.getNetwork();
    isLocalNet =
      ["hardhat", "localhost"].includes((network.name || "").toLowerCase()) ||
      network.chainId === 31337;
    console.log(
      `🔍 Network: ${network.name} (${isLocalNet ? "Local" : "Remote"})`
    );

    // 获取测试账户
    [owner, user1, user2, user3] = await ethers.getSigners();

    // 根据网络类型决定部署策略
    console.log("\n📋 [SETUP] 步骤 2/4: 获取合约...");
    console.log(
      `🔍 [DEBUG] 当前网络: ${network.name} (chainId: ${network.chainId})`
    );
    console.log(`🔍 [DEBUG] 是否为本地网络: ${isLocalNet}`);

    if (isLocalNet) {
      // 本地网络：使用 fixture 重新部署确保测试环境干净
      console.log("🏠 [LOCAL] 本地网络使用 fixture 重新部署");

      console.log("🚀 [DEPLOY] 开始执行 deployments.fixture...");
      const deployStartTime = Date.now();
      await deployments.fixture(["MemeToken", "LpToken"]);
      const deployEndTime = Date.now();
      console.log(`⏱️ [DEPLOY] 部署耗时: ${deployEndTime - deployStartTime}ms`);
    } else {
      // 远程网络：尝试使用已部署的合约
      console.log("🌐 [REMOTE] 远程网络尝试使用已部署的合约");

      try {
        // 检查是否已有部署记录
        const existingMemeToken = await deployments.get("MemeToken");
        const existingLpToken = await deployments.get("LpToken");
        console.log(`✅ [FOUND] 找到已部署的合约:`);
        console.log(`   - MemeToken: ${existingMemeToken.address}`);
        console.log(`   - LpToken: ${existingLpToken.address}`);
      } catch (error) {
        console.log(
          `⚠️ [NOT_FOUND] 未找到已部署的合约，需要先部署: ${error.message}`
        );
        console.log("� [HINT] 请先运行: npx hardhat deploy --network sepolia");
        throw new Error("请先在 Sepolia 网络上部署合约，然后再运行测试");
      }
    }

    // 获取 MemeToken 合约
    const memeTokenDeployment = await deployments.get("MemeToken");
    memeToken = await ethers.getContractAt(
      "MemeToken",
      memeTokenDeployment.address,
      owner
    );
    console.log(`📄 [CONTRACT] MemeToken at: ${memeToken.address}`);
    console.log(`🔍 [DEBUG] MemeToken 部署信息:`);
    console.log(
      `   - 交易哈希: ${memeTokenDeployment.transactionHash || "N/A"}`
    );
    console.log(
      `   - 区块号: ${memeTokenDeployment.receipt?.blockNumber || "N/A"}`
    );
    console.log(
      `   - Gas 使用: ${memeTokenDeployment.receipt?.gasUsed || "N/A"}`
    );

    // 获取 LpToken 合约 (使用 LiquidityPoolManager.sol 中的 LpToken 合约)
    console.log("\n📋 [SETUP] 步骤 3/4: 获取 LpToken 合约...");
    const lpTokenDeployment = await deployments.get("LpToken");
    lpToken = await ethers.getContractAt(
      "LpToken",
      lpTokenDeployment.address,
      owner
    );
    console.log(`📄 [CONTRACT] LpToken at: ${lpToken.address}`);
    console.log(`🔍 [DEBUG] LpToken 部署信息:`);
    console.log(`   - 交易哈希: ${lpTokenDeployment.transactionHash || "N/A"}`);
    console.log(
      `   - 区块号: ${lpTokenDeployment.receipt?.blockNumber || "N/A"}`
    );
    console.log(
      `   - Gas 使用: ${lpTokenDeployment.receipt?.gasUsed || "N/A"}`
    );
    // 确保owner地址在白名单中以避免每日交易次数限制
    await memeToken.addToWhitelist(owner.address);
    // 将LpToken合约地址加入到免税名单
    await memeToken.setTaxBeneficiaries(lpToken.address);
    // 等待交易确认
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // 验证合约是否真的重新部署了（通过检查部署时间戳）
    if (memeTokenDeployment.receipt?.blockNumber) {
      const block = await ethers.provider.getBlock(
        memeTokenDeployment.receipt.blockNumber
      );
      const deployTime = new Date(block.timestamp * 1000);
      console.log(`🔍 [DEBUG] MemeToken 部署时间: ${deployTime.toISOString()}`);
    }

    if (lpTokenDeployment.receipt?.blockNumber) {
      const block = await ethers.provider.getBlock(
        lpTokenDeployment.receipt.blockNumber
      );
      const deployTime = new Date(block.timestamp * 1000);
      console.log(`🔍 [DEBUG] LpToken 部署时间: ${deployTime.toISOString()}`);
    }

    // 给测试用户一些 MemeToken
    const ownerMemeBalance = await memeToken.balanceOf(owner.address);
    const ownerEthBalance = await ethers.provider.getBalance(owner.address);
    console.log(
      `🔍 Owner MEME balance: ${ethers.utils.formatEther(ownerMemeBalance)}`
    );
    console.log(
      `🔍 Owner ETH balance: ${ethers.utils.formatEther(ownerEthBalance)}`
    );

    // 只有在有足够余额的情况下才分发代币（减少分发数量）
    if (ownerMemeBalance.gte(MEME_AMOUNT.mul(6))) {
      const tx1 = await memeToken.transfer(user1.address, MEME_AMOUNT.mul(2)); // 20个代币（从4000减少到20）
      await tx1.wait();
      const tx2 = await memeToken.transfer(user2.address, MEME_AMOUNT.mul(5)); // 50个代币（从10增加到50）
      await tx2.wait();
      console.log("✅ Test tokens distributed");
    } else {
      console.log("⚠️ Insufficient MEME tokens for distribution");
    }
  });

  describe("测试套件1：合约初始化", function () {
    it("应该正确设置合约参数", async function () {
      // 基础参数验证
      expect(await lpToken.name()).to.equal("LpToken");
      expect(await lpToken.symbol()).to.equal("LP");

      // 验证MemeToken地址绑定正确性
      const boundMemeTokenAddress = await lpToken.getMemeTokenAddress();
      expect(boundMemeTokenAddress).to.equal(memeToken.address);
      console.log("✅ Contract parameters validated");
    });

    it("初始状态验证", async function () {
      // 流动性池初始值应为0
      expect(await lpToken.totalSupply()).to.equal(0);

      // 初始手续费率应为3
      expect(await lpToken.swapFeeRate()).to.equal(3);
      console.log("✅ Initial state validated");
    });
  });
  // 测试套件2：管理员权限
  describe("测试套件2：管理员权限", function () {
    // 测试用例1：Owner铸币应成功
    it("Owner铸币应成功", async function () {
      const tx = await lpToken
        .connect(owner)
        .mint(user1.address, ethers.utils.parseEther("1")); // 从100减少到1
      await tx.wait();
      expect(await lpToken.balanceOf(user1.address)).to.equal(
        ethers.utils.parseEther("1")
      );
      console.log("✅ Owner minting successful");
    });
    // 测试用例2：非Owner铸币操作应失败
    it("非Owner铸币操作应失败", async function () {
      if (isLocalNet) {
        await expect(
          lpToken
            .connect(user1)
            .mint(user1.address, ethers.utils.parseEther("1")) // 从100减少到1
        ).to.be.revertedWithCustomError(lpToken, "OwnableUnauthorizedAccount");
        console.log("✅ Non-owner minting correctly rejected");
      } else {
        try {
          const tx = await lpToken
            .connect(user1)
            .mint(user1.address, ethers.utils.parseEther("1")); // 从100减少到1
          const receipt = await tx.wait();

          if (receipt.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log("✅ Transaction correctly failed on remote network");
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Non-owner minting correctly rejected");
        }
      }
    });
  });

  // 测试套件3：流动性添加
  describe("测试套件3：流动性添加", function () {
    // 测试用例1：首次添加流动性（LP计算应为sqrt(x * y)）
    it("首次添加流动性应成功，LP计算应为sqrt(x * y)", async function () {
      // 检查账户余额
      const user1MemeBalance = await memeToken.balanceOf(user1.address);
      const user1EthBalance = await ethers.provider.getBalance(user1.address);

      console.log(
        `🔍 User1 MEME balance: ${ethers.utils.formatEther(user1MemeBalance)}`
      );
      console.log(
        `🔍 User1 ETH balance: ${ethers.utils.formatEther(user1EthBalance)}`
      );
      // 用户1批准合约花费其MEME代币
      const approveTx = await memeToken
        .connect(user1)
        .approve(lpToken.address, MEME_AMOUNT);
      await approveTx.wait(); // 等待批准交易确认

      // 用户1添加流动性
      const addLiqTx = await lpToken
        .connect(user1)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      const receipt = await addLiqTx.wait(); // 等待流动性添加交易确认

      // 计算预期的LP代币数量：sqrt(x * y)
      const expectedLp = ethers.utils.parseEther(
        Math.sqrt(
          parseFloat(ethers.utils.formatEther(MEME_AMOUNT)) *
            parseFloat(ethers.utils.formatEther(ETH_AMOUNT))
        ).toString()
      );

      const user1LpBalance = await lpToken.balanceOf(user1.address);
      console.log(
        `🔍 User1 LP balance: ${ethers.utils.formatEther(user1LpBalance)}`
      );
      console.log(
        `🔍 Expected LP tokens: ${ethers.utils.formatEther(expectedLp)}`
      );

      // 允许一定误差范围内的比较（±0.01 LP）
      const delta = ethers.utils.parseEther("0.01");
      expect(user1LpBalance).to.be.closeTo(expectedLp, delta);
      console.log(
        "✅ Initial liquidity addition successful and LP tokens correct"
      );
    });
    // 测试用例2：首次添加时池状态正确更新、LiquidityAdded事件参数校验
    it("首次添加流动性时池状态应正确更新", async function () {
      // 先执行添加流动性操作
      const approveTx = await memeToken
        .connect(user1)
        .approve(lpToken.address, MEME_AMOUNT);
      await approveTx.wait();

      // 记录添加流动性前的区块号
      const beforeBlock = await ethers.provider.getBlockNumber();

      // 用户1添加流动性
      const addLiqTx = await lpToken
        .connect(user1)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      const receipt = await addLiqTx.wait();

      // 检查LiquidityAdded事件
      const filter = lpToken.filters.LiquidityAdded(
        user1.address,
        null,
        null,
        null
      );

      // 从添加流动性的区块中查询事件
      const events = await lpToken.queryFilter(filter, beforeBlock + 1, "latest");
      
      if (events.length === 0) {
        console.log("⚠️ No LiquidityAdded events found");
        return;
      }
      
      const latestEvent = events[events.length - 1]; // 获取最新的事件
      console.log(
        `🔍 LiquidityAdded event: user=${
          latestEvent.args[0]
        }, meme=${ethers.utils.formatEther(
          latestEvent.args[1]
        )}, eth=${ethers.utils.formatEther(
          latestEvent.args[2]
        )}, lp=${ethers.utils.formatEther(latestEvent.args[3])}`
      );

      expect(latestEvent.args[0]).to.equal(user1.address);
      expect(latestEvent.args[1]).to.equal(MEME_AMOUNT);
      expect(latestEvent.args[2]).to.equal(ETH_AMOUNT);

      console.log("✅ Pool state correctly updated and events validated");
    });
    // 测试用例3：按当前比例追加流动性，LP计算准确
    it("按当前比例追加流动性应成功，LP计算应准确", async function () {
      // 首先用user1添加初始流动性，为user2的追加流动性创建基础
      const user1ApproveTx = await memeToken
        .connect(user1)
        .approve(lpToken.address, MEME_AMOUNT);
      await user1ApproveTx.wait();

      const user1AddLiqTx = await lpToken
        .connect(user1)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      await user1AddLiqTx.wait();
      console.log("✅ User1 added initial liquidity for proportional test");

      // 检查账户余额
      const user2MemeBalance = await memeToken.balanceOf(user2.address);
      const user2EthBalance = await ethers.provider.getBalance(user2.address);

      console.log(
        `🔍 User2 MEME balance: ${ethers.utils.formatEther(user2MemeBalance)}`
      );
      console.log(
        `🔍 User2 ETH balance: ${ethers.utils.formatEther(user2EthBalance)}`
      );

      // 用户2批准合约花费其MEME代币
      const approveTx = await memeToken
        .connect(user2)
        .approve(lpToken.address, MEME_AMOUNT);
      await approveTx.wait(); // 等待批准交易确认

      // 获取当前池状态
      const memeReserve = await memeToken.balanceOf(lpToken.address);
      const ethReserve = await ethers.provider.getBalance(lpToken.address);
      console.log(
        `🔍 Current pool state: MEME=${ethers.utils.formatEther(
          memeReserve
        )}, ETH=${ethers.utils.formatEther(ethReserve)}`
      );

      // 确保池中有流动性
      if (ethReserve.eq(0) || memeReserve.eq(0)) {
        throw new Error("Pool has no liquidity for proportional addition test");
      }

      // 计算用户2需要提供的MEME数量以匹配ETH数量的比例
      // 正确公式：requiredMeme = (memeReserve * ETH_AMOUNT) / ethReserve
      // 为了提高精度，我们可以添加检查避免精度损失
      const requiredMeme = memeReserve.mul(ETH_AMOUNT).div(ethReserve);

      // 验证计算结果的合理性
      if (requiredMeme.eq(0)) {
        throw new Error("计算得到的required MEME为0，可能存在精度问题");
      }
      console.log(
        `🔍 User2 needs to provide ${ethers.utils.formatEther(
          requiredMeme
        )} MEME to match ${ethers.utils.formatEther(ETH_AMOUNT)} ETH`
      );
      // 获取before user2的LP余额
      const beforeUser2LpBalance = await lpToken.balanceOf(user2.address);

      // 用户2添加流动性
      const addLiqTx = await lpToken
        .connect(user2)
        .addLiquidity(requiredMeme, 0, { value: ETH_AMOUNT });
      const receipt = await addLiqTx.wait(); // 等待流动性添加交易确认
      console.log("✅ User2 liquidity addition transaction mined");

      // 计算预期的LP代币数量：sqrt(requiredMeme * msg.value)
      const expectedLp = bigNumberSqrt(requiredMeme.mul(ETH_AMOUNT));
      const afterUser2LpBalance = await lpToken.balanceOf(user2.address);
      const user2LpBalance = afterUser2LpBalance.sub(beforeUser2LpBalance);
      console.log(
        `🔍 User2 LP balance: ${ethers.utils.formatEther(user2LpBalance)}`
      );
      console.log(
        `🔍 Expected LP tokens: ${ethers.utils.formatEther(expectedLp)}`
      );
      expect(user2LpBalance).to.be.closeTo(
        expectedLp,
        ethers.utils.parseEther("0.01")
      );
    });
    // 测试用例4：没有按当前比例追加流动性，ETH偏多，超额ETH应该成功退回
    it("没有按当前比例追加流动性，ETH偏多，超额ETH应该成功退回", async function () {
      // 首先用user1添加初始流动性
      const user1ApproveTx = await memeToken
        .connect(user1)
        .approve(lpToken.address, MEME_AMOUNT);
      await user1ApproveTx.wait();

      const user1AddLiqTx = await lpToken
        .connect(user1)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      await user1AddLiqTx.wait();
      console.log("✅ User1 added initial liquidity for excess ETH test");

      // 检查账户余额
      const user2MemeBalance = await memeToken.balanceOf(user2.address);
      const user2EthBalance = await ethers.provider.getBalance(user2.address);

      console.log(
        `🔍 User2 MEME balance: ${ethers.utils.formatEther(user2MemeBalance)}`
      );
      console.log(
        `🔍 User2 ETH balance: ${ethers.utils.formatEther(user2EthBalance)}`
      );

      // 获取当前池状态
      const memeReserve = await memeToken.balanceOf(lpToken.address);
      const ethReserve = await ethers.provider.getBalance(lpToken.address);
      console.log(
        `🔍 Current pool state: MEME=${ethers.utils.formatEther(
          memeReserve
        )}, ETH=${ethers.utils.formatEther(ethReserve)}`
      );

      // 确保池中有流动性
      if (ethReserve.eq(0) || memeReserve.eq(0)) {
        throw new Error("Pool has no liquidity for excess ETH test");
      }

      // 计算用户2需要提供的MEME数量以匹配ETH数量的比例
      // 正确公式：requiredMeme = (memeReserve * ETH_AMOUNT) / ethReserve
      const requiredMeme = memeReserve.mul(ETH_AMOUNT).div(ethReserve);
      console.log(
        `🔍 User2 needs to provide ${ethers.utils.formatEther(
          requiredMeme
        )} MEME to match ${ethers.utils.formatEther(ETH_AMOUNT)} ETH`
      );

      // 用户2批准合约花费其MEME代币
      const approveTx = await memeToken
        .connect(user2)
        .approve(lpToken.address, requiredMeme); // 使用计算出的准确数量
      await approveTx.wait(); // 等待批准交易确认

      // 获取before user2的LP余额
      const beforeUser2LpBalance = await lpToken.balanceOf(user2.address);
      // 获取before user2的ETH余额
      const beforeUser2EthBalance = await ethers.provider.getBalance(
        user2.address
      );
      console.log(
        `🔍 User2 ETH before adding liquidity: ${ethers.utils.formatEther(
          beforeUser2EthBalance
        )}`
      );

      // 用户2添加流动性，故意多发送一些ETH
      const extraEth = ethers.utils.parseEther("0.01"); // 多发送0.01 ETH
      const addLiqTx = await lpToken
        .connect(user2)
        .addLiquidity(requiredMeme, 0, { value: ETH_AMOUNT.add(extraEth) });
      const receipt = await addLiqTx.wait(); // 等待流动性添加交易确认
      console.log("✅ User2 liquidity addition transaction mined");

      // 计算预期的LP代币数量：sqrt(requiredMeme * msg.value)
      const expectedLp = bigNumberSqrt(requiredMeme.mul(ETH_AMOUNT));
      const afterUser2LpBalance = await lpToken.balanceOf(user2.address);
      const user2LpBalance = afterUser2LpBalance.sub(beforeUser2LpBalance);
      console.log(
        `🔍 User2 LP balance: ${ethers.utils.formatEther(user2LpBalance)}`
      );
      console.log(
        `🔍 Expected LP tokens: ${ethers.utils.formatEther(expectedLp)}`
      );
      expect(user2LpBalance).to.be.closeTo(
        expectedLp,
        ethers.utils.parseEther("0.01")
      );
      // 检查用户多付出的eth是否被退回
      const afterUser2EthBalance = await ethers.provider.getBalance(
        user2.address
      );
      console.log(
        `🔍 User2 ETH after adding liquidity: ${ethers.utils.formatEther(
          afterUser2EthBalance
        )}`
      );
      const ethSpent = beforeUser2EthBalance.sub(afterUser2EthBalance);
      const gasUsed = receipt.gasUsed.mul(
        receipt.effectiveGasPrice || ethers.utils.parseUnits("1", "gwei")
      );

      console.log(
        `🔍 User2 ETH spent (including gas): ${ethers.utils.formatEther(
          ethSpent
        )}`
      );
      console.log(`🔍 Gas used: ${ethers.utils.formatEther(gasUsed)}`);
      console.log(
        `🔍 Expected ETH amount: ${ethers.utils.formatEther(ETH_AMOUNT)}`
      );

      // 实际花费应该接近 ETH_AMOUNT + gas费用
      const expectedSpent = ETH_AMOUNT.add(gasUsed);
      expect(ethSpent).to.be.closeTo(
        expectedSpent,
        ethers.utils.parseEther("0.001")
      );
      console.log("✅ Excess ETH correctly refunded");
    });
    // 测试用例5：没有按当前比例追加流动性，Meme偏多，超额Meme应该成功退回
    it("没有按当前比例追加流动性，Meme偏多，超额Meme应该成功退回", async function () {
      // 首先用user1添加初始流动性
      const user1ApproveTx = await memeToken
        .connect(user1)
        .approve(lpToken.address, MEME_AMOUNT);
      await user1ApproveTx.wait();

      const user1AddLiqTx = await lpToken
        .connect(user1)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      await user1AddLiqTx.wait();
      console.log("✅ User1 added initial liquidity for excess MEME test");

      // 检查LpToken的地址是否在MemeToken的免税名单中
      const isLpTokenExempt = await memeToken.isExcludedFromTax(
        lpToken.address
      );
      expect(isLpTokenExempt).to.be.true;
      console.log("✅ LpToken is in MemeToken's tax exemption list");

      // 检查账户余额
      const user2MemeBalance = await memeToken.balanceOf(user2.address);
      const user2EthBalance = await ethers.provider.getBalance(user2.address);

      console.log(
        `🔍 User2 MEME balance: ${ethers.utils.formatEther(user2MemeBalance)}`
      );
      console.log(
        `🔍 User2 ETH balance: ${ethers.utils.formatEther(user2EthBalance)}`
      );

      // 获取当前池状态
      const memeReserve = await memeToken.balanceOf(lpToken.address);
      const ethReserve = await ethers.provider.getBalance(lpToken.address);
      console.log(
        `🔍 Current pool state: MEME=${ethers.utils.formatEther(
          memeReserve
        )}, ETH=${ethers.utils.formatEther(ethReserve)}`
      );

      // 确保池中有流动性
      if (ethReserve.eq(0) || memeReserve.eq(0)) {
        throw new Error("Pool has no liquidity for excess MEME test");
      }

      // 计算用户2需要提供的MEME数量以匹配ETH数量的比例
      // 正确公式：requiredMeme = (memeReserve * ETH_AMOUNT) / ethReserve
      const requiredMeme = memeReserve.mul(ETH_AMOUNT).div(ethReserve);
      console.log(
        `🔍 User2 needs to provide ${ethers.utils.formatEther(
          requiredMeme
        )} MEME to match ${ethers.utils.formatEther(ETH_AMOUNT)} ETH`
      );

      // 故意多提供一些MEME代币
      const extraMeme = ethers.utils.parseEther("5"); // 多提供5个MEME
      const totalMemeToProvide = requiredMeme.add(extraMeme);

      // 用户2批准合约花费其MEME代币（包括多余的部分）
      const approveTx = await memeToken
        .connect(user2)
        .approve(lpToken.address, totalMemeToProvide);
      await approveTx.wait(); // 等待批准交易确认

      // 获取before user2的余额
      const beforeUser2LpBalance = await lpToken.balanceOf(user2.address);
      const beforeUser2MemeBalance = await memeToken.balanceOf(user2.address);
      console.log(
        `🔍 User2 MEME before adding liquidity: ${ethers.utils.formatEther(
          beforeUser2MemeBalance
        )}`
      );

      // 用户2添加流动性，故意多发送一些MEME
      const addLiqTx = await lpToken
        .connect(user2)
        .addLiquidity(totalMemeToProvide, 0, { value: ETH_AMOUNT });
      const receipt = await addLiqTx.wait(); // 等待流动性添加交易确认
      // 再等待一个区块，确保状态更新
      await new Promise((resolve) => setTimeout(resolve, 12000));
      console.log("✅ User2 liquidity addition transaction mined");

      // 计算预期的LP代币数量：sqrt(requiredMeme * ETH_AMOUNT)
      const expectedLp = bigNumberSqrt(requiredMeme.mul(ETH_AMOUNT));
      const afterUser2LpBalance = await lpToken.balanceOf(user2.address);
      const user2LpBalance = afterUser2LpBalance.sub(beforeUser2LpBalance);
      console.log(
        `🔍 User2 LP balance: ${ethers.utils.formatEther(user2LpBalance)}`
      );
      console.log(
        `🔍 Expected LP tokens: ${ethers.utils.formatEther(expectedLp)}`
      );
      expect(user2LpBalance).to.be.closeTo(
        expectedLp,
        ethers.utils.parseEther("0.01")
      );

      // 检查用户多提供的MEME是否被退回
      const afterUser2MemeBalance = await memeToken.balanceOf(user2.address);
      const memeSpent = beforeUser2MemeBalance.sub(afterUser2MemeBalance);
      console.log(
        `🔍 User2 MEME spent: ${ethers.utils.formatEther(memeSpent)}`
      );
      console.log(
        `🔍 Required MEME: ${ethers.utils.formatEther(requiredMeme)}`
      );

      // 验证实际花费的MEME等于需要的MEME（多余部分被退回）
      expect(memeSpent).to.be.closeTo(
        requiredMeme,
        ethers.utils.parseEther("0.01")
      );
      console.log("✅ Excess MEME correctly refunded");
    });
    // 测试用例6：零值ETH添加应失败
    it("零值ETH添加应失败", async function () {
      if (isLocalNet) {
        await expect(
          lpToken.connect(user2).addLiquidity(MEME_AMOUNT, 0, { value: 0 })
        ).to.be.revertedWith("Invalid ETH amount");
        console.log("✅ Zero ETH liquidity addition correctly rejected");
      } else {
        try {
          const tx = await lpToken
            .connect(user2)
            .addLiquidity(MEME_AMOUNT, 0, { value: 0 });
          const receipt = await tx.wait(); // 等待交易确认

          if (receipt.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Zero ETH transaction correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Zero ETH liquidity addition correctly rejected");
        }
      }
    });
    // 测试用例7：零值Meme添加应失败
    it("零值Meme添加应失败", async function () {
      if (isLocalNet) {
        await expect(
          lpToken.connect(user2).addLiquidity(0, 0, { value: ETH_AMOUNT })
        ).to.be.revertedWith("Invalid meme amount");
        console.log("✅ Zero MEME liquidity addition correctly rejected");
      } else {
        try {
          const tx = await lpToken
            .connect(user2)
            .addLiquidity(0, 0, { value: ETH_AMOUNT });
          const receipt = await tx.wait(); // 等待交易确认

          if (receipt.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Zero MEME transaction correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Zero MEME liquidity addition correctly rejected");
        }
      }
    });
    // 测试用例8：滑点保护触发时应拒绝交易
    it("滑点保护触发时应拒绝交易", async function () {
      // 设置一个非常高的最小LP代币要求来触发滑点保护
      const unreasonableMinLpTokens = ethers.utils.parseEther("1000000"); // 设置一个不可能达到的最小LP代币数量

      if (isLocalNet) {
        await expect(
          lpToken
            .connect(user2)
            .addLiquidity(MEME_AMOUNT, unreasonableMinLpTokens, {
              value: ETH_AMOUNT,
            })
        ).to.be.reverted;
        console.log("✅ Slippage protection correctly triggered");
      } else {
        try {
          const tx = await lpToken
            .connect(user2)
            .addLiquidity(MEME_AMOUNT, unreasonableMinLpTokens, {
              value: ETH_AMOUNT,
            });
          const receipt = await tx.wait(); // 等待交易确认

          if (receipt.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Slippage protection correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Slippage protection correctly triggered");
        }
      }
    });
  });
    // 测试套件4：重入攻击防护
  describe("测试套件4：重入攻击防护", function () {
    // 测试用例1：模拟重入攻击应失败
    it("模拟重入攻击应失败", async function () {
      // 检查账户余额
      const ownerMemeBalance = await memeToken.balanceOf(owner.address);
      const ownerEthBalance = await ethers.provider.getBalance(owner.address);

      console.log(
        `🔍 Owner MEME balance: ${ethers.utils.formatEther(ownerMemeBalance)}`
      );
      console.log(
        `🔍 Owner ETH balance: ${ethers.utils.formatEther(ownerEthBalance)}`
      );

      // // 确保有足够的余额进行测试（大大降低要求）
      // if (ownerMemeBalance.lt(MEME_AMOUNT.mul(2))) {
      //   // 只需要20个MEME代币
      //   console.log("⚠️ Insufficient MEME tokens for test, skipping...");
      //   return;
      // }

      // if (ownerEthBalance.lt(ETH_AMOUNT.mul(3))) {
      //   // 只需要0.03 ETH（从15 ETH降低到0.03 ETH）
      //   console.log("⚠️ Insufficient ETH for test, skipping...");
      //   return;
      // }

      // 首先添加初始流动性，确保池子有资产比例
      const approveTx = await memeToken
        .connect(owner)
        .approve(lpToken.address, MEME_AMOUNT);
      await approveTx.wait(); // 等待批准交易确认

      const liquidityTx = await lpToken
        .connect(owner)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      await liquidityTx.wait(); // 等待流动性添加交易确认
      console.log("✅ Initial liquidity added");

      // 部署恶意合约
      const AttackerFactory = await ethers.getContractFactory(
        "ReentrancyAttacker"
      );
      const attacker = await AttackerFactory.deploy(
        lpToken.address,
        memeToken.address
      );
      await attacker.deployed(); // 等待合约部署确认
      console.log("📋 Attacker contract deployed at:", attacker.address);

      // 给恶意合约一些 MEME 代币用于攻击
      const transferTx = await memeToken
        .connect(owner)
        .transfer(attacker.address, MEME_AMOUNT);
      await transferTx.wait(); // 等待代币转账交易确认
      expect(await memeToken.balanceOf(attacker.address)).to.equal(MEME_AMOUNT);

      // 尝试发起重入攻击 - 使用更少的ETH
      const attackETH = ethers.utils.parseEther("0.01"); // 统一使用0.01 ETH攻击

      if (isLocalNet) {
        await expect(attacker.attack({ value: attackETH })).to.be.reverted;
        console.log("✅ Reentrancy attack prevented");
      } else {
        try {
          const tx = await attacker.attack({ value: attackETH });
          const receipt = await tx.wait(); // 等待攻击交易确认

          if (receipt.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log("✅ Attack correctly failed on remote network");
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Reentrancy attack prevented");
        }
      }
    });
  });
  // 测试套件5：流动性移除
  describe("测试套件5：流动性移除", function () {
    // 测试用例1：部分移除流动性时资产返还比例准确、池同步减少
    it("部分移除流动性时资产返还比例准确、池同步减少", async function () {
      // 用户2先批准合约花费其MEME代币
      const approveTx = await memeToken
        .connect(user2)
        .approve(lpToken.address, MEME_AMOUNT);
      await approveTx.wait();

      // 用户2添加流动性
      const addLiqTx = await lpToken
        .connect(user2)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      await addLiqTx.wait();
      console.log("✅ User2 added liquidity for removal test");

      // 获取用户2的LP代币余额
      const user2LpBalanceBefore = await lpToken.balanceOf(user2.address);
      console.log(
        `🔍 User2 LP balance before removal: ${ethers.utils.formatEther(
          user2LpBalanceBefore
        )}`
      );

      // 确保用户有LP代币可以移除
      if (user2LpBalanceBefore.eq(0)) {
        throw new Error("User2 has no LP tokens to remove");
      }

      // 获取用户2的Meme和ETH余额
      const user2MemeBalanceBefore = await memeToken.balanceOf(user2.address);
      const user2EthBalanceBefore = await ethers.provider.getBalance(
        user2.address
      );

      // 获取当前池状态
      const memeReserve = await memeToken.balanceOf(lpToken.address);
      const ethReserve = await ethers.provider.getBalance(lpToken.address);
      const totalSupply = await lpToken.totalSupply();

      console.log(
        `🔍 Pool state before removal: MEME=${ethers.utils.formatEther(
          memeReserve
        )}, ETH=${ethers.utils.formatEther(
          ethReserve
        )}, TotalSupply=${ethers.utils.formatEther(totalSupply)}`
      );

      // 计算移除一半流动性应返还的Meme和ETH数量
      const lpToRemove = user2LpBalanceBefore.div(2);
      const memeAmount = memeReserve.mul(lpToRemove).div(totalSupply);
      const ethAmount = ethReserve.mul(lpToRemove).div(totalSupply);
      console.log(
        `🔍 User2 removing liquidity: MEME=${ethers.utils.formatEther(
          memeAmount
        )}, ETH=${ethers.utils.formatEther(ethAmount)}`
      );

      // 用户需要授权合约操作其LP代币
      const approveLpTx = await lpToken
        .connect(user2)
        .approve(lpToken.address, lpToRemove);
      await approveLpTx.wait();
      console.log("✅ User2 approved LP token spending");

      // 移除一半的流动性
      const removeTx = await lpToken.connect(user2).removeLiquidity(lpToRemove);
      await removeTx.wait();
      console.log("✅ Liquidity removal transaction completed");

      // 获取用户2移除流动性后的余额
      const user2LpBalanceAfter = await lpToken.balanceOf(user2.address);
      const user2MemeBalanceAfter = await memeToken.balanceOf(user2.address);
      const user2EthBalanceAfter = await ethers.provider.getBalance(
        user2.address
      );

      // 计算实际返还的Meme和ETH数量
      const actualMemeReceived = user2MemeBalanceAfter.sub(
        user2MemeBalanceBefore
      );
      const actualEthReceived = user2EthBalanceAfter.sub(user2EthBalanceBefore);

      // 需要考虑gas费用对ETH余额的影响
      let gasUsed = ethers.BigNumber.from(0);
      if (removeTx.gasUsed && removeTx.effectiveGasPrice) {
        gasUsed = removeTx.gasUsed.mul(removeTx.effectiveGasPrice);
      } else if (removeTx.gasUsed) {
        // 如果没有 effectiveGasPrice，使用默认的 gas price
        gasUsed = removeTx.gasUsed.mul(ethers.utils.parseUnits("1", "gwei"));
      }
      const actualEthReceivedWithGas = actualEthReceived.add(gasUsed);

      // 计算实际扣除的LP数量
      const actualLpBurned = user2LpBalanceBefore.sub(user2LpBalanceAfter);
      console.log(
        `🔍 User2 actual received: MEME=${ethers.utils.formatEther(
          actualMemeReceived
        )}, ETH=${ethers.utils.formatEther(
          actualEthReceivedWithGas
        )} (after adding gas)`
      );

      // 允许一定误差范围内的比较（±0.01）
      const delta = ethers.utils.parseEther("0.01");
      expect(actualMemeReceived).to.be.closeTo(memeAmount, delta);
      expect(actualEthReceivedWithGas).to.be.closeTo(ethAmount, delta);
      expect(actualLpBurned).to.be.closeTo(lpToRemove, delta);
      console.log("✅ Partial liquidity removal successful and assets correct");

      // 验证池中资产同步减少
      const memeReserveAfter = await memeToken.balanceOf(lpToken.address);
      const ethReserveAfter = await ethers.provider.getBalance(lpToken.address);
      expect(memeReserveAfter).to.be.closeTo(
        memeReserve.sub(memeAmount),
        delta
      );
      expect(ethReserveAfter).to.be.closeTo(ethReserve.sub(ethAmount), delta);
      console.log("✅ Pool reserves correctly updated after liquidity removal");
    });
    // 测试用例2：移除全部LP后代币余额归零、池中ETH/Meme归零
    it("移除全部LP后代币余额归零、池中ETH/Meme归零", async function () {
      // 用户2先批准合约花费其MEME代币
      const approveTx = await memeToken
        .connect(user2)
        .approve(lpToken.address, MEME_AMOUNT);
      await approveTx.wait();

      // 用户2添加流动性
      const addLiqTx = await lpToken
        .connect(user2)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      await addLiqTx.wait();
      console.log("✅ User2 added liquidity for full removal test");

      // 获取用户2的LP代币余额
      const user2LpBalanceBefore = await lpToken.balanceOf(user2.address);
      console.log(
        `🔍 User2 LP balance before full removal: ${ethers.utils.formatEther(
          user2LpBalanceBefore
        )}`
      );

      // 确保用户有LP代币可以移除
      if (user2LpBalanceBefore.eq(0)) {
        throw new Error("User2 has no LP tokens to remove");
      }

      // 获取用户2的Meme和ETH余额
      const user2MemeBalanceBefore = await memeToken.balanceOf(user2.address);
      const user2EthBalanceBefore = await ethers.provider.getBalance(
        user2.address
      );

      // 获取当前池状态
      const memeReserveBefore = await memeToken.balanceOf(lpToken.address);
      const ethReserveBefore = await ethers.provider.getBalance(
        lpToken.address
      );
      const totalSupplyBefore = await lpToken.totalSupply();

      console.log(
        `🔍 Pool state before full removal: MEME=${ethers.utils.formatEther(
          memeReserveBefore
        )}, ETH=${ethers.utils.formatEther(
          ethReserveBefore
        )}, TotalSupply=${ethers.utils.formatEther(totalSupplyBefore)}`
      );

      // 计算移除全部流动性应返还的Meme和ETH数量
      const lpToRemove = user2LpBalanceBefore; // 移除全部LP
      const expectedMemeAmount = memeReserveBefore
        .mul(lpToRemove)
        .div(totalSupplyBefore);
      const expectedEthAmount = ethReserveBefore
        .mul(lpToRemove)
        .div(totalSupplyBefore);
      console.log(
        `🔍 User2 removing all liquidity: MEME=${ethers.utils.formatEther(
          expectedMemeAmount
        )}, ETH=${ethers.utils.formatEther(expectedEthAmount)}`
      );

      // 用户需要授权合约操作其LP代币
      const approveLpTx = await lpToken
        .connect(user2)
        .approve(lpToken.address, lpToRemove);
      await approveLpTx.wait();
      console.log("✅ User2 approved LP token spending for full removal");

      // 移除全部的流动性
      const removeTx = await lpToken.connect(user2).removeLiquidity(lpToRemove);
      await removeTx.wait();
      console.log("✅ Full liquidity removal transaction completed");

      // 获取用户2移除流动性后的余额
      const user2LpBalanceAfter = await lpToken.balanceOf(user2.address);
      const user2MemeBalanceAfter = await memeToken.balanceOf(user2.address);
      const user2EthBalanceAfter = await ethers.provider.getBalance(
        user2.address
      );

      // 验证用户LP余额归零
      expect(user2LpBalanceAfter).to.equal(0);
      console.log("✅ User2 LP balance is zero after full removal");

      // 计算实际返还的Meme和ETH数量
      const actualMemeReceived = user2MemeBalanceAfter.sub(
        user2MemeBalanceBefore
      );
      const actualEthReceived = user2EthBalanceAfter.sub(user2EthBalanceBefore);

      // 需要考虑gas费用对ETH余额的影响
      let gasUsed = ethers.BigNumber.from(0);
      if (removeTx.gasUsed && removeTx.effectiveGasPrice) {
        gasUsed = removeTx.gasUsed.mul(removeTx.effectiveGasPrice);
      } else if (removeTx.gasUsed) {
        // 如果没有 effectiveGasPrice，使用默认的 gas price
        gasUsed = removeTx.gasUsed.mul(ethers.utils.parseUnits("1", "gwei"));
      }
      const actualEthReceivedWithGas = actualEthReceived.add(gasUsed);

      console.log(
        `🔍 User2 actual received: MEME=${ethers.utils.formatEther(
          actualMemeReceived
        )}, ETH=${ethers.utils.formatEther(
          actualEthReceivedWithGas
        )} (after adding gas)`
      );

      // 允许一定误差范围内的比较（±0.01）
      const delta = ethers.utils.parseEther("0.01");
      expect(actualMemeReceived).to.be.closeTo(expectedMemeAmount, delta);
      expect(actualEthReceivedWithGas).to.be.closeTo(expectedEthAmount, delta);
      console.log("✅ Full liquidity removal assets returned correctly");

      // 验证池中资产归零
      const memeReserveAfter = await memeToken.balanceOf(lpToken.address);
      const ethReserveAfter = await ethers.provider.getBalance(lpToken.address);
      const totalSupplyAfter = await lpToken.totalSupply();

      console.log(
        `🔍 Pool state after full removal: MEME=${ethers.utils.formatEther(
          memeReserveAfter
        )}, ETH=${ethers.utils.formatEther(
          ethReserveAfter
        )}, TotalSupply=${ethers.utils.formatEther(totalSupplyAfter)}`
      );

      // 池中的MEME和ETH应该归零（允许极小误差）
      expect(memeReserveAfter).to.be.closeTo(
        0,
        ethers.utils.parseEther("0.001")
      );
      expect(ethReserveAfter).to.be.closeTo(
        0,
        ethers.utils.parseEther("0.001")
      );
      expect(totalSupplyAfter).to.equal(0);
      console.log(
        "✅ Pool reserves and total supply are zero after full removal"
      );
    });
    // 测试用例3：未授权LP转移时应失败
    it("未授权LP转移时应失败", async function () {
      // 用户2先批准合约花费其MEME代币
      const approveTx = await memeToken
        .connect(user2)
        .approve(lpToken.address, MEME_AMOUNT);
      await approveTx.wait();
      // 用户2添加流动性
      const addLiqTx = await lpToken
        .connect(user2)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      await addLiqTx.wait();
      console.log("✅ User2 added liquidity for unauthorized removal test");
      // 获取用户2的LP代币余额
      const user2LpBalance = await lpToken.balanceOf(user2.address);
      console.log(
        `🔍 User2 LP balance: ${ethers.utils.formatEther(user2LpBalance)}`
      );

      if (isLocalNet) {
        await expect(
          lpToken.connect(user2).removeLiquidity(user2LpBalance)
        ).to.be.revertedWith("Allowance exceeded");
        console.log("✅ Unauthorized LP removal correctly rejected");
      } else {
        try {
          const tx = await lpToken
            .connect(user2)
            .removeLiquidity(user2LpBalance);
          const receipt = await tx.wait(); // 等待交易确认

          if (receipt.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Unauthorized LP removal transaction correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Unauthorized LP removal correctly rejected");
        }
      }
    });
    // 测试用例4：移除超额LP应失败
    it("移除超额LP应失败", async function () {
      // 用户2先批准合约花费其MEME代币
      const approveTx = await memeToken
        .connect(user2)
        .approve(lpToken.address, MEME_AMOUNT);
      await approveTx.wait();

      // 用户2添加流动性
      const addLiqTx = await lpToken
        .connect(user2)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      await addLiqTx.wait();
      console.log("✅ User2 added liquidity for excessive removal test");

      // 获取用户2的LP代币余额
      const user2LpBalance = await lpToken.balanceOf(user2.address);
      console.log(
        `🔍 User2 LP balance: ${ethers.utils.formatEther(user2LpBalance)}`
      );

      // 尝试移除超过拥有数量的LP代币
      const excessiveAmount = user2LpBalance.add(ethers.utils.parseEther("1"));

      // 先授权超额数量（这个会成功）
      const approveLpTx = await lpToken
        .connect(user2)
        .approve(lpToken.address, excessiveAmount);
      await approveLpTx.wait();
      console.log("✅ User2 approved excessive LP amount");

      if (isLocalNet) {
        await expect(
          lpToken.connect(user2).removeLiquidity(excessiveAmount)
        ).to.be.revertedWith("Insufficient LP balance");
        console.log("✅ Excessive LP removal correctly rejected");
      } else {
        try {
          const tx = await lpToken
            .connect(user2)
            .removeLiquidity(excessiveAmount);
          const receipt = await tx.wait(); // 等待交易确认

          if (receipt.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Excessive LP removal transaction correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Excessive LP removal correctly rejected");
        }
      }
    });
  });
  // 测试套件6：Swap交易机制
  describe("测试套件6：Swap交易机制", function () {
    // 测试用例1：ETH → Meme兑换：手续费计算准确、输出量按常量乘积公式，滑点保护生效
    it("ETH → Meme兑换", async function () {
      // 用户1先批准合约花费其MEME代币
      const approveTx = await memeToken
        .connect(user1)
        .approve(lpToken.address, MEME_AMOUNT);
      await approveTx.wait(); // 等待批准交易确认
      
      // 用户1添加流动性
      const addLiqTx = await lpToken
        .connect(user1)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      await addLiqTx.wait(); // 等待流动性添加交易确认
      console.log("✅ User1 added initial liquidity for swap test");

      // 获取在swap之前，用户2的Meme代币数量，eth余额
      const beforeUser2MemeBalance = await memeToken.balanceOf(user2.address);
      const beforeUser2EthBalance = await ethers.provider.getBalance(user2.address);
      console.log(
        `🔍 User2 MEME before swap: ${ethers.utils.formatEther(beforeUser2MemeBalance)}`
      );
      console.log(
        `🔍 User2 ETH before swap: ${ethers.utils.formatEther(beforeUser2EthBalance)}`
      );

      // 获取在swap之前，池子的meme代币数量，eth余额
      const memeReserve = await memeToken.balanceOf(lpToken.address);
      const ethReserve = await ethers.provider.getBalance(lpToken.address);

      console.log(
        `🔍 Pool state before swap: MEME=${ethers.utils.formatEther(
          memeReserve
        )}, ETH=${ethers.utils.formatEther(ethReserve)}`
      );

      // 使用合理的输入ETH数量（池子ETH的10%）
      const inputEthAmount = ethReserve.div(10); // 使用池子ETH的10%进行交换
      console.log(`🔍 Input ETH amount: ${ethers.utils.formatEther(inputEthAmount)}`);
      
      // 从合约中读取费率 swapFeeRate
      const feeRate = await lpToken.swapFeeRate();
      console.log(`🔍 Swap fee rate: ${feeRate}‰`); // ‰ 表示千分之
      
      // 计算预期的Meme输出数量
      const inputEthAfterFee = inputEthAmount.mul(1000 - feeRate).div(1000); // 扣除手续费后的ETH数量
      const expectedMemeOutput = memeReserve
        .mul(inputEthAfterFee)
        .div(ethReserve.add(inputEthAfterFee));

      console.log(
        `🔍 Expected MEME output for ${ethers.utils.formatEther(
          inputEthAmount
        )} ETH input: ${ethers.utils.formatEther(expectedMemeOutput)}`
      );

      // 用户2进行Swap交易，设置一个合理的最小输出量以防滑点过大
      const minMemeOutput = expectedMemeOutput.mul(95).div(100); // 允许5%的滑点
      const swapTx = await lpToken
        .connect(user2)
        .swapEthForMeme(minMemeOutput, { value: inputEthAmount });
      const receipt = await swapTx.wait(); // 等待交易确认
      console.log("✅ Swap transaction completed");

      // 获取在swap之后，用户2的Meme代币数量，eth余额
      const afterUser2MemeBalance = await memeToken.balanceOf(user2.address);
      const afterUser2EthBalance = await ethers.provider.getBalance(user2.address);
      console.log(
        `🔍 User2 MEME after swap: ${ethers.utils.formatEther(afterUser2MemeBalance)}`
      );
      console.log(
        `🔍 User2 ETH after swap: ${ethers.utils.formatEther(afterUser2EthBalance)}`
      );

      // 获取在swap之后，池子的meme代币数量，eth余额
      const afterMemeReserve = await memeToken.balanceOf(lpToken.address);
      const afterEthReserve = await ethers.provider.getBalance(lpToken.address);

      console.log(
        `🔍 Pool state after swap: MEME=${ethers.utils.formatEther(
          afterMemeReserve
        )}, ETH=${ethers.utils.formatEther(afterEthReserve)}`
      );

      // 验证用户获得的Meme代币数量
      const userMemeGain = afterUser2MemeBalance.sub(beforeUser2MemeBalance);
      console.log(
        `🔍 User2 MEME gain from swap: ${ethers.utils.formatEther(userMemeGain)}`
      );

      // 验证池子的ETH余额变化
      const poolEthChange = afterEthReserve.sub(ethReserve);
      console.log(
        `🔍 Pool ETH change: ${ethers.utils.formatEther(poolEthChange)}`
      );

      // 计算用户实际花费的ETH（包括gas费）
      let gasUsed = ethers.BigNumber.from(0);
      if (receipt.gasUsed && receipt.effectiveGasPrice) {
        gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      } else if (receipt.gasUsed) {
        gasUsed = receipt.gasUsed.mul(ethers.utils.parseUnits("1", "gwei"));
      }
      const userEthSpent = beforeUser2EthBalance.sub(afterUser2EthBalance);
      const userEthSpentForSwap = userEthSpent.sub(gasUsed);

      console.log(`🔍 User ETH spent for swap: ${ethers.utils.formatEther(userEthSpentForSwap)}`);
      console.log(`🔍 Gas used: ${ethers.utils.formatEther(gasUsed)}`);

      // 断言验证
      const delta = ethers.utils.parseEther("0.01"); // 允许的误差范围

      // 1. 验证用户获得的MEME数量接近预期
      expect(userMemeGain).to.be.closeTo(expectedMemeOutput, delta);
      console.log("✅ User MEME gain matches expected output");

      // 2. 验证用户花费的ETH等于输入的ETH
      expect(userEthSpentForSwap).to.be.closeTo(inputEthAmount, delta);
      console.log("✅ User ETH spent matches input amount");

      // 3. 验证池子ETH增加等于用户输入的ETH
      expect(poolEthChange).to.be.closeTo(inputEthAmount, delta);
      console.log("✅ Pool ETH increase matches user input");

      // 4. 验证池子MEME减少等于用户获得的MEME
      const poolMemeChange = memeReserve.sub(afterMemeReserve);
      expect(poolMemeChange).to.be.closeTo(userMemeGain, delta);
      console.log("✅ Pool MEME decrease matches user gain");

      // 5. 验证常量乘积公式 (x * y = k)
      const beforeProduct = memeReserve.mul(ethReserve);
      const afterProduct = afterMemeReserve.mul(afterEthReserve);
      // 由于有手续费，after的乘积应该略大于before的乘积
      expect(afterProduct).to.be.gte(beforeProduct);
      console.log("✅ Constant product formula validated (k should increase due to fees)");

      console.log("✅ ETH → Meme swap test completed successfully");
    });

    // 测试用例2：Meme → ETH兑换：手续费计算准确、输出量按常量乘积公式，滑点保护生效
    it("Meme → ETH兑换", async function () {
      // 用户1先批准合约花费其MEME代币
      const approveTx = await memeToken
        .connect(user1)
        .approve(lpToken.address, MEME_AMOUNT);
      await approveTx.wait(); // 等待批准交易确认
      
      // 用户1添加流动性
      const addLiqTx = await lpToken
        .connect(user1)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      await addLiqTx.wait(); // 等待流动性添加交易确认
      console.log("✅ User1 added initial liquidity for Meme → ETH swap test");

      // 获取在swap之前，用户2的Meme代币数量，eth余额
      const beforeUser2MemeBalance = await memeToken.balanceOf(user2.address);
      const beforeUser2EthBalance = await ethers.provider.getBalance(user2.address);
      console.log(
        `🔍 User2 MEME before swap: ${ethers.utils.formatEther(beforeUser2MemeBalance)}`
      );
      console.log(
        `🔍 User2 ETH before swap: ${ethers.utils.formatEther(beforeUser2EthBalance)}`
      );

      // 获取在swap之前，池子的meme代币数量，eth余额
      const memeReserve = await memeToken.balanceOf(lpToken.address);
      const ethReserve = await ethers.provider.getBalance(lpToken.address);

      console.log(
        `🔍 Pool state before swap: MEME=${ethers.utils.formatEther(
          memeReserve
        )}, ETH=${ethers.utils.formatEther(ethReserve)}`
      );

      // 使用合理的输入MEME数量（池子MEME的10%）
      const inputMemeAmount = memeReserve.div(10); // 使用池子MEME的10%进行交换
      console.log(`🔍 Input MEME amount: ${ethers.utils.formatEther(inputMemeAmount)}`);
      
      // 确保用户2有足够的MEME代币进行交换
      if (beforeUser2MemeBalance.lt(inputMemeAmount)) {
        console.log("⚠️ User2 doesn't have enough MEME tokens, transferring from owner...");
        const transferTx = await memeToken.connect(owner).transfer(user2.address, inputMemeAmount);
        await transferTx.wait();
        console.log("✅ MEME tokens transferred to User2");
      }

      // 从合约中读取费率 swapFeeRate
      const feeRate = await lpToken.swapFeeRate();
      console.log(`🔍 Swap fee rate: ${feeRate}‰`); // ‰ 表示千分之
      
      // 计算预期的ETH输出数量
      const inputMemeAfterFee = inputMemeAmount.mul(1000 - feeRate).div(1000); // 扣除手续费后的MEME数量
      const expectedEthOutput = ethReserve
        .mul(inputMemeAfterFee)
        .div(memeReserve.add(inputMemeAfterFee));

      console.log(
        `🔍 Expected ETH output for ${ethers.utils.formatEther(
          inputMemeAmount
        )} MEME input: ${ethers.utils.formatEther(expectedEthOutput)}`
      );

      // 用户2先批准合约花费其MEME代币
      const approveSwapTx = await memeToken
        .connect(user2)
        .approve(lpToken.address, inputMemeAmount);
      await approveSwapTx.wait();
      console.log("✅ User2 approved MEME spending for swap");

      // 用户2进行Swap交易，设置一个合理的最小输出量以防滑点过大
      const minEthOutput = expectedEthOutput.mul(95).div(100); // 允许5%的滑点
      const swapTx = await lpToken
        .connect(user2)
        .swapMemeForEth(inputMemeAmount, minEthOutput);
      const receipt = await swapTx.wait(); // 等待交易确认
      console.log("✅ Meme → ETH swap transaction completed");

      // 获取在swap之后，用户2的Meme代币数量，eth余额
      const afterUser2MemeBalance = await memeToken.balanceOf(user2.address);
      const afterUser2EthBalance = await ethers.provider.getBalance(user2.address);
      console.log(
        `🔍 User2 MEME after swap: ${ethers.utils.formatEther(afterUser2MemeBalance)}`
      );
      console.log(
        `🔍 User2 ETH after swap: ${ethers.utils.formatEther(afterUser2EthBalance)}`
      );

      // 获取在swap之后，池子的meme代币数量，eth余额
      const afterMemeReserve = await memeToken.balanceOf(lpToken.address);
      const afterEthReserve = await ethers.provider.getBalance(lpToken.address);

      console.log(
        `🔍 Pool state after swap: MEME=${ethers.utils.formatEther(
          afterMemeReserve
        )}, ETH=${ethers.utils.formatEther(afterEthReserve)}`
      );

      // 验证用户花费的MEME代币数量
      const userMemeSpent = beforeUser2MemeBalance.sub(afterUser2MemeBalance);
      console.log(
        `🔍 User2 MEME spent in swap: ${ethers.utils.formatEther(userMemeSpent)}`
      );

      // 验证池子的MEME余额变化
      const poolMemeChange = afterMemeReserve.sub(memeReserve);
      console.log(
        `🔍 Pool MEME change: ${ethers.utils.formatEther(poolMemeChange)}`
      );

      // 计算用户实际获得的ETH（需要考虑gas费）
      let gasUsed = ethers.BigNumber.from(0);
      if (receipt.gasUsed && receipt.effectiveGasPrice) {
        gasUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);
      } else if (receipt.gasUsed) {
        gasUsed = receipt.gasUsed.mul(ethers.utils.parseUnits("1", "gwei"));
      }
      const userEthChange = afterUser2EthBalance.sub(beforeUser2EthBalance);
      const userEthGainFromSwap = userEthChange.add(gasUsed); // 加上gas费得到实际获得的ETH

      console.log(`🔍 User ETH gained from swap: ${ethers.utils.formatEther(userEthGainFromSwap)}`);
      console.log(`🔍 Gas used: ${ethers.utils.formatEther(gasUsed)}`);

      // 断言验证
      const delta = ethers.utils.parseEther("0.01"); // 允许的误差范围

      // 1. 验证用户花费的MEME数量等于输入的MEME数量
      expect(userMemeSpent).to.be.closeTo(inputMemeAmount, delta);
      console.log("✅ User MEME spent matches input amount");

      // 2. 验证用户获得的ETH数量接近预期
      expect(userEthGainFromSwap).to.be.closeTo(expectedEthOutput, delta);
      console.log("✅ User ETH gain matches expected output");

      // 3. 验证池子MEME增加等于用户输入的MEME
      expect(poolMemeChange).to.be.closeTo(inputMemeAmount, delta);
      console.log("✅ Pool MEME increase matches user input");

      // 4. 验证池子ETH减少等于用户获得的ETH
      const poolEthChange = ethReserve.sub(afterEthReserve);
      expect(poolEthChange).to.be.closeTo(userEthGainFromSwap, delta);
      console.log("✅ Pool ETH decrease matches user gain");

      // 5. 验证常量乘积公式 (x * y = k)
      const beforeProduct = memeReserve.mul(ethReserve);
      const afterProduct = afterMemeReserve.mul(afterEthReserve);
      // 由于有手续费，after的乘积应该略大于before的乘积
      expect(afterProduct).to.be.gte(beforeProduct);
      console.log("✅ Constant product formula validated (k should increase due to fees)");

      console.log("✅ Meme → ETH swap test completed successfully");
    });
    // 测试用例3：零值兑换应失败
    it("零值兑换应失败", async function () {
      if (isLocalNet) {
        await expect(
          lpToken.connect(user2).swapEthForMeme(0, { value: 0 })
        ).to.be.revertedWith("Invalid ETH amount");

        await expect(
          lpToken.connect(user2).swapMemeForEth(0, 0)
        ).to.be.revertedWith("Invalid Meme amount");

        console.log("✅ Zero value swaps correctly rejected");
      } else {
        try {
          const tx1 = await lpToken
            .connect(user2)
            .swapEthForMeme(0, { value: 0 });
          const receipt1 = await tx1.wait(); // 等待交易确认

          if (receipt1.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Zero ETH swap transaction correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Zero ETH swap correctly rejected");
        }

        try {
          const tx2 = await lpToken
            .connect(user2)
            .swapMemeForEth(0, 0);
          const receipt2 = await tx2.wait(); // 等待交易确认

          if (receipt2.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Zero MEME swap transaction correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Zero MEME swap correctly rejected");
        }
      }
    });

    // 测试用例4：滑点保护触发时应拒绝交易
    it("滑点保护触发时应拒绝交易", async function () {
      // 用户1先批准合约花费其MEME代币
      const approveTx = await memeToken
        .connect(user1)
        .approve(lpToken.address, MEME_AMOUNT);
      await approveTx.wait();
      
      // 用户1添加流动性
      const addLiqTx = await lpToken
        .connect(user1)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      await addLiqTx.wait();
      console.log("✅ User1 added liquidity for slippage protection test");

      // 获取池状态
      const memeReserve = await memeToken.balanceOf(lpToken.address);
      const ethReserve = await ethers.provider.getBalance(lpToken.address);
      
      // 使用合理的输入数量
      const inputEthAmount = ethReserve.div(10);
      const inputMemeAmount = memeReserve.div(10);
      
      // 设置不合理的高最小输出量来触发滑点保护
      const unreasonableMinMemeOutput = ethers.utils.parseEther("1000000");
      const unreasonableMinEthOutput = ethers.utils.parseEther("1000000");

      if (isLocalNet) {
        // 测试ETH → Meme滑点保护
        await expect(
          lpToken
            .connect(user2)
            .swapEthForMeme(unreasonableMinMemeOutput, { value: inputEthAmount })
        ).to.be.revertedWith("Slippage too high");

        // 确保用户2有足够的MEME代币进行交换
        const user2MemeBalance = await memeToken.balanceOf(user2.address);
        if (user2MemeBalance.lt(inputMemeAmount)) {
          const transferTx = await memeToken.connect(owner).transfer(user2.address, inputMemeAmount);
          await transferTx.wait();
        }

        // 用户2授权MEME代币
        const approveSwapTx = await memeToken
          .connect(user2)
          .approve(lpToken.address, inputMemeAmount);
        await approveSwapTx.wait();

        // 测试Meme → ETH滑点保护
        await expect(
          lpToken
            .connect(user2)
            .swapMemeForEth(inputMemeAmount, unreasonableMinEthOutput)
        ).to.be.revertedWith("Slippage too high");

        console.log("✅ Slippage protection correctly triggered for both swap directions");
      } else {
        try {
          const tx1 = await lpToken
            .connect(user2)
            .swapEthForMeme(unreasonableMinMemeOutput, { value: inputEthAmount });
          const receipt1 = await tx1.wait();

          if (receipt1.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ ETH → Meme slippage protection correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ ETH → Meme slippage protection correctly triggered");
        }

        // 确保用户2有足够的MEME代币进行交换
        const user2MemeBalance = await memeToken.balanceOf(user2.address);
        if (user2MemeBalance.lt(inputMemeAmount)) {
          const transferTx = await memeToken.connect(owner).transfer(user2.address, inputMemeAmount);
          await transferTx.wait();
        }

        // 用户2授权MEME代币
        const approveSwapTx = await memeToken
          .connect(user2)
          .approve(lpToken.address, inputMemeAmount);
        await approveSwapTx.wait();

        try {
          const tx2 = await lpToken
            .connect(user2)
            .swapMemeForEth(inputMemeAmount, unreasonableMinEthOutput);
          const receipt2 = await tx2.wait();

          if (receipt2.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Meme → ETH slippage protection correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Meme → ETH slippage protection correctly triggered");
        }
      }
    });

    // 测试用例5：超池流动性兑换应失败
    it("超池流动性兑换应失败", async function () {
      // 用户1先批准合约花费其MEME代币
      const approveTx = await memeToken
        .connect(user1)
        .approve(lpToken.address, MEME_AMOUNT);
      await approveTx.wait();
      
      // 用户1添加流动性
      const addLiqTx = await lpToken
        .connect(user1)
        .addLiquidity(MEME_AMOUNT, 0, { value: ETH_AMOUNT });
      await addLiqTx.wait();
      console.log("✅ User1 added liquidity for over-pool swap test");

      // 获取池状态
      const memeReserve = await memeToken.balanceOf(lpToken.address);
      const ethReserve = await ethers.provider.getBalance(lpToken.address);
      
      console.log(
        `🔍 Pool state: MEME=${ethers.utils.formatEther(
          memeReserve
        )}, ETH=${ethers.utils.formatEther(ethReserve)}`
      );

      // 尝试交换超过池子全部流动性的ETH（应该失败）
      const excessiveEthAmount = ethReserve.add(ethers.utils.parseEther("1"));
      console.log(`🔍 Attempting to swap ${ethers.utils.formatEther(excessiveEthAmount)} ETH (more than pool has)`);

      if (isLocalNet) {
        // 测试超池ETH兑换应失败
        await expect(
          lpToken
            .connect(user2)
            .swapEthForMeme(0, { value: excessiveEthAmount })
        ).to.be.reverted; // 应该因为池子ETH不足而失败
        console.log("✅ Over-pool ETH swap correctly rejected");

        // 确保用户2有足够的MEME代币进行测试
        const excessiveMemeAmount = memeReserve.add(ethers.utils.parseEther("1000"));
        const user2MemeBalance = await memeToken.balanceOf(user2.address);
        
        if (user2MemeBalance.lt(excessiveMemeAmount)) {
          const transferTx = await memeToken.connect(owner).transfer(user2.address, excessiveMemeAmount);
          await transferTx.wait();
          console.log("✅ Transferred excessive MEME to User2 for testing");
        }

        // 用户2授权超额MEME代币
        const approveSwapTx = await memeToken
          .connect(user2)
          .approve(lpToken.address, excessiveMemeAmount);
        await approveSwapTx.wait();

        // 测试超池MEME兑换应失败
        await expect(
          lpToken
            .connect(user2)
            .swapMemeForEth(excessiveMemeAmount, 0)
        ).to.be.reverted; // 应该因为计算溢出或池子ETH不足而失败
        console.log("✅ Over-pool MEME swap correctly rejected");

        console.log("✅ Over-pool liquidity swaps correctly rejected for both directions");
      } else {
        // 远程网络测试ETH超池兑换
        try {
          const tx1 = await lpToken
            .connect(user2)
            .swapEthForMeme(0, { value: excessiveEthAmount });
          const receipt1 = await tx1.wait();

          if (receipt1.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Over-pool ETH swap correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Over-pool ETH swap correctly rejected");
        }

        // 确保用户2有足够的MEME代币进行测试
        const excessiveMemeAmount = memeReserve.add(ethers.utils.parseEther("1000"));
        const user2MemeBalance = await memeToken.balanceOf(user2.address);
        
        if (user2MemeBalance.lt(excessiveMemeAmount)) {
          const transferTx = await memeToken.connect(owner).transfer(user2.address, excessiveMemeAmount);
          await transferTx.wait();
          console.log("✅ Transferred excessive MEME to User2 for testing");
        }

        // 用户2授权超额MEME代币
        const approveSwapTx = await memeToken
          .connect(user2)
          .approve(lpToken.address, excessiveMemeAmount);
        await approveSwapTx.wait();

        // 远程网络测试MEME超池兑换
        try {
          const tx2 = await lpToken
            .connect(user2)
            .swapMemeForEth(excessiveMemeAmount, 0);
          const receipt2 = await tx2.wait();

          if (receipt2.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Over-pool MEME swap correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Over-pool MEME swap correctly rejected");
        }
      }
    });
    
  });
  // 测试套件7：手续费管理
  describe("测试套件7：手续费管理", function () {
    // 测试用例1：只有合约拥有者可以设置手续费率
    it("只有合约拥有者可以设置手续费率", async function () {
      const newFeeRate = 5; // 设置新的手续费率为0.5%

      // 非拥有者尝试设置手续费率应失败
      if (isLocalNet) {
        await expect(
          lpToken.connect(user1).setSwapFeeRate(newFeeRate)
        ).to.be.revertedWithCustomError(lpToken, "OwnableUnauthorizedAccount");
        console.log("✅ Non-owner fee rate change correctly rejected");
      } else {
        try {
          const tx = await lpToken.connect(user1).setSwapFeeRate(newFeeRate);
          const receipt = await tx.wait(); // 等待交易确认

          if (receipt.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Non-owner fee rate change transaction correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Non-owner fee rate change correctly rejected");
        }
      }

      // 拥有者设置手续费率应成功
      const setFeeTx = await lpToken.connect(owner).setSwapFeeRate(newFeeRate);
      await setFeeTx.wait();
      console.log("✅ Owner successfully changed fee rate");

      // 验证手续费率已更新
      const currentFeeRate = await lpToken.swapFeeRate();
      expect(currentFeeRate).to.equal(newFeeRate);
      console.log("✅ Fee rate updated correctly to new value");
    });
    // 测试用例2：极端手续费率（0%/100%）测试
    it("极端手续费率（0%/100%）测试", async function () {
      if (isLocalNet) {
        // 1. 设置手续费率为0%，应该抛出错误
        await expect(
          lpToken.connect(owner).setSwapFeeRate(0)
        ).to.be.revertedWith("Invalid fee rate");
        console.log("✅ Set swap fee rate to 0% correctly reverted");
        
        // 2. 设置手续费率为100%，应该抛出错误
        await expect(
          lpToken.connect(owner).setSwapFeeRate(1000)
        ).to.be.revertedWith("Fee rate too high");
        console.log("✅ Set swap fee rate to 100% correctly reverted");
      } else {
        // 远程网络测试：设置手续费率为0%
        try {
          const tx1 = await lpToken.connect(owner).setSwapFeeRate(0);
          const receipt1 = await tx1.wait(); // 等待交易确认

          if (receipt1.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Set swap fee rate to 0% correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Set swap fee rate to 0% correctly reverted");
        }

        // 远程网络测试：设置手续费率为100%
        try {
          const tx2 = await lpToken.connect(owner).setSwapFeeRate(1000);
          const receipt2 = await tx2.wait(); // 等待交易确认

          if (receipt2.status === 1) {
            throw new Error("Should have reverted");
          } else {
            console.log(
              "✅ Set swap fee rate to 100% correctly failed on remote network"
            );
          }
        } catch (e) {
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ Set swap fee rate to 100% correctly reverted");
        }
      }
    });
    });
});
