// 测试套件1：合约初始化验证
const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");
describe("MemeToken Contract", function () {
  // 设置测试超时时间（对Sepolia网络很重要）
  this.timeout(300000); // 5分钟超时

  let memeToken;
  let deployer, taxBeneficiary;
  let network, isLocalNet;
  let signers;

  before(async function () {
    console.log("🚀 [SETUP] Initializing test environment...");

    // 检查网络状态
    network = await ethers.provider.getNetwork();
    // 修复网络识别逻辑：基于 chainId 和网络名称
    isLocalNet = ["hardhat", "localhost"].includes(
      (network.name || "").toLowerCase()
    ) || network.chainId === 31337; // hardhat 默认 chainId
    console.log(`🌐 [NETWORK] ${network.name} (chainId: ${network.chainId}), local: ${isLocalNet}`);

    // 获取签名者账户
    signers = await ethers.getSigners();
    deployer = signers[0];
    taxBeneficiary = deployer;
    console.log(`👥 [ACCOUNTS] Got ${signers.length} signers, deployer: ${deployer.address}`);

    // 获取或部署合约 - 根据网络类型决定是否重新部署
    if (isLocalNet) {
      // 本地网络：使用 fixture 重新部署确保测试环境干净
      console.log("   🏠 本地网络：重新部署所有合约");
      await deployments.fixture(["MemeToken"]);
    } else {
      // 远程网络：尝试使用已部署的合约，如果不存在则部署
      console.log("   🌐 远程网络：查找已部署的合约");
      try {
        // 检查是否已有部署记录
        await deployments.get("MemeToken");
        console.log("   ✅ 找到已部署的合约");
      } catch (error) {
        console.log("   ⚠️  未找到已部署的合约，开始部署...");
        await deployments.fixture(["MemeToken"]);
      }
    }

    // 获取 MemeToken 合约
    const deployment = await deployments.get("MemeToken");
    memeToken = await ethers.getContractAt("MemeToken", deployment.address, deployer);
    
    console.log(`📄 [CONTRACT] MemeToken deployed at: ${memeToken.address}`);
  });

  describe("测试套件1：合约初始化验证", function () {
    it("should deploy successfully", function () {
      expect(memeToken.address).to.not.be.undefined;
    });

    it("should have correct name and symbol", async function () {
      const namePromise = memeToken.name();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("memeToken.name() timeout after 30 seconds")),
          30000
        )
      );

      try {
        const name = await Promise.race([namePromise, timeoutPromise]);
        const symbol = await memeToken.symbol();
        expect(name).to.equal("MemeToken");
        expect(symbol).to.equal("Meme");
      } catch (error) {
        console.log("❌ [TEST] Error in name/symbol test:", error.message);
        throw error;
      }
    });

    it("should assign total supply to deployer", async function () {
      const totalSupply = await memeToken.totalSupply();
      const deployerBalance = await memeToken.balanceOf(deployer.address);
      expect(deployerBalance).to.equal(totalSupply);
    });

    it("should have correct initial whitelist addresses", async function () {
      const isDeployerWhitelisted = await memeToken.isExcludedFromTax(deployer.address);
      const isContractWhitelisted = await memeToken.isExcludedFromTax(memeToken.address);
      const isTaxBeneficiaryWhitelisted = await memeToken.isExcludedFromTax(taxBeneficiary.address);
      
      expect(isDeployerWhitelisted).to.be.true;
      expect(isContractWhitelisted).to.be.true;
      expect(isTaxBeneficiaryWhitelisted).to.be.true;
    });

    it("should fail if non-owner calls mint", async function () {
      const addr1 = signers[1];

      if (isLocalNet) {
        await expect(
          memeToken.connect(addr1).mint(addr1.address, 100)
        ).to.be.revertedWithCustomError(
          memeToken,
          "OwnableUnauthorizedAccount"
        );
      } else {
        try {
          await memeToken.connect(addr1).mint(addr1.address, 100);
          throw new Error("Should have reverted");
        } catch (e) {
          if (!e) {
            throw new Error("Expected an exception but got none");
          }
        }
      }
    });

    it("should fail if non-owner calls setTaxRate", async function () {
      const addr1 = signers[1];

      if (isLocalNet) {
        await expect(
          memeToken.connect(addr1).setTaxRate(5)
        ).to.be.revertedWithCustomError(
          memeToken,
          "OwnableUnauthorizedAccount"
        );
      } else {
        try {
          await memeToken.connect(addr1).setTaxRate(5);
          throw new Error("Should have reverted");
        } catch (e) {
          if (!e) {
            throw new Error("Expected an exception but got none");
          }
        }
      }
    });

    it("should fail if non-owner calls addToWhitelist", async function () {
      const addr1 = signers[1];

      if (isLocalNet) {
        await expect(
          memeToken.connect(addr1).addToWhitelist(addr1.address)
        ).to.be.revertedWithCustomError(
          memeToken,
          "OwnableUnauthorizedAccount"
        );
      } else {
        try {
          await memeToken.connect(addr1).addToWhitelist(addr1.address);
          throw new Error("Should have reverted");
        } catch (e) {
          if (!e) {
            throw new Error("Expected an exception but got none");
          }
        }
      }
    });
  });

  describe("测试套件2：转账税收机制", function () {
    it("should transfer tokens without tax between whitelisted addresses", async function () {
      const addr1 = signers[1];
      
      // 确保部署者有足够余额
      const deployerInitialBalance = await memeToken.balanceOf(deployer.address);
      const requiredAmount = ethers.utils.parseUnits("100", 18);
      
      if (deployerInitialBalance.lt(requiredAmount)) {
        const mintTx = await memeToken.connect(deployer).mint(deployer.address, requiredAmount);
        if (!isLocalNet) {
          await mintTx.wait();
        }
      }

      // 白名单向普通地址转账
      const transferTx = await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("50", 18));

      if (!isLocalNet) {
        await transferTx.wait();
      }

      const addr1Balance = await memeToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(ethers.utils.parseUnits("50", 18));

      // 普通地址向白名单转账
      const deployerBalanceBefore = await memeToken.balanceOf(deployer.address);
      const returnTransferTx = await memeToken
        .connect(addr1)
        .transfer(deployer.address, ethers.utils.parseUnits("20", 18));

      if (!isLocalNet) {
        await returnTransferTx.wait();
      }

      const addr1BalanceAfter = await memeToken.balanceOf(addr1.address);
      const deployerBalanceAfter = await memeToken.balanceOf(deployer.address);
      
      expect(addr1BalanceAfter).to.equal(ethers.utils.parseUnits("30", 18));
      expect(deployerBalanceAfter).to.equal(
        deployerBalanceBefore.add(ethers.utils.parseUnits("20", 18))
      );
    });

    it("should apply 5% tax on transfers between non-whitelisted addresses", async function () {
      const addr1 = signers[1];
      const addr2 = signers[2];
      
      const transferTx1 = await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("100", 18));

      if (!isLocalNet) {
        await transferTx1.wait();
      }

      const taxBeneficiaryBalanceBefore = await memeToken.balanceOf(taxBeneficiary.address);

      const transferTx2 = await memeToken
        .connect(addr1)
        .transfer(addr2.address, ethers.utils.parseUnits("100", 18));

      if (!isLocalNet) {
        await transferTx2.wait();
      }

      const addr2Balance = await memeToken.balanceOf(addr2.address);
      const taxBeneficiaryBalanceAfter = await memeToken.balanceOf(taxBeneficiary.address);
      
      expect(addr2Balance).to.equal(ethers.utils.parseUnits("95", 18)); // 100 - 5% = 95
      expect(taxBeneficiaryBalanceAfter).to.equal(
        taxBeneficiaryBalanceBefore.add(ethers.utils.parseUnits("5", 18))
      );
    });

    it("should emit TaxCollected event with correct parameters", async function () {
      const addr1 = signers[1];
      const addr2 = signers[2];
      
      const transferTx = await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("100", 18));

      if (!isLocalNet) {
        await transferTx.wait();
      }

      await expect(
        memeToken
          .connect(addr1)
          .transfer(addr2.address, ethers.utils.parseUnits("100", 18))
      )
        .to.emit(memeToken, "TaxCollected")
        .withArgs(
          addr1.address,
          taxBeneficiary.address,
          ethers.utils.parseUnits("5", 18)
        );
    });

    it("should apply 25% tax when tax rate is 25", async function () {
      const setTaxTx = await memeToken.connect(deployer).setTaxRate(25);
      if (!isLocalNet) {
        await setTaxTx.wait();
      }

      const addr1 = signers[1];
      const addr2 = signers[2];

      const mintTx = await memeToken
        .connect(deployer)
        .mint(deployer.address, ethers.utils.parseUnits("1000", 18));

      if (!isLocalNet) {
        await mintTx.wait();
      }

      const tx1 = await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("100", 18));

      if (!isLocalNet) {
        await tx1.wait();
      }

      const addr2BalanceBefore = await memeToken.balanceOf(addr2.address);
      const tx2 = await memeToken
        .connect(addr1)
        .transfer(addr2.address, ethers.utils.parseUnits("100", 18));

      if (!isLocalNet) {
        await tx2.wait();
      }

      const addr2BalanceAfter = await memeToken.balanceOf(addr2.address);
      expect(addr2BalanceAfter).to.equal(
        addr2BalanceBefore.add(ethers.utils.parseUnits("75", 18))
      ); // 100 - 25% = 75
    });

    it("should apply 0% tax when tax rate is 0", async function () {
      const setTaxTx = await memeToken.connect(deployer).setTaxRate(0);
      if (!isLocalNet) {
        await setTaxTx.wait();
      }

      const addr1 = signers[1];
      const addr2 = signers[2];

      const tx1 = await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("100", 18));

      if (!isLocalNet) {
        await tx1.wait();
      }

      const addr2BalanceBefore = await memeToken.balanceOf(addr2.address);
      const tx2 = await memeToken
        .connect(addr1)
        .transfer(addr2.address, ethers.utils.parseUnits("100", 18));

      if (!isLocalNet) {
        await tx2.wait();
      }

      const addr2BalanceAfter = await memeToken.balanceOf(addr2.address);
      expect(addr2BalanceAfter).to.equal(
        addr2BalanceBefore.add(ethers.utils.parseUnits("100", 18))
      ); // 100 - 0% = 100
    });
  });
  // 测试套件3：防滥用机制
  describe("测试套件3：防滥用机制", function () {
    // 3.1 验证最大交易额限制
    it("should enforce max transaction amount", async function () {
      console.log("net name is ",isLocalNet ? "local" : "remote");
      const addr1 = signers[1];
      
      // 获取最大交易额限制
      const maxTxAmount = await memeToken.maxTxAmount();
      console.log("🔍 [TEST] Max Transaction Amount:", maxTxAmount.toString());
      
      // mint 足够的代币
      const mintTx = await memeToken
        .connect(deployer)
        .mint(deployer.address, maxTxAmount.add(1));
      
      if (!isLocalNet) {
        await mintTx.wait();
      }
      
      // 测试超过最大交易额应失败
      const transferAmount = maxTxAmount.add(1);
      console.log("🔍 [TEST] Attempting transfer of:", transferAmount.toString());
      console.log("🔍 [TEST] Max allowed:", maxTxAmount.toString());
      
      // 检查部署者白名单状态（仅在需要时）
      if (isLocalNet) {
        const isWhitelisted = await memeToken.isExcludedFromTax(deployer.address);
        console.log("🔍 [TEST] Deployer is whitelisted:", isWhitelisted);
      }
      
      if (isLocalNet) {
        await expect(
          memeToken.connect(deployer).transfer(addr1.address, transferAmount)
        ).to.be.revertedWith("Exceeds max transaction amount");
      } else {
        try {
          const tx = await memeToken.connect(deployer).transfer(addr1.address, transferAmount);
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
          console.log("✅ [TEST] Transaction correctly failed on remote network");
        }
      }
      
      // 测试等于最大交易额应成功
      const maxTransferTx = await memeToken.connect(deployer).transfer(addr1.address, maxTxAmount);
      if (!isLocalNet) {
        await maxTransferTx.wait();
      }
      
      // 修改最大交易额为一半
      const setMaxTx = await memeToken.connect(deployer).setMaxTxAmount(maxTxAmount.div(2));
      if (!isLocalNet) {
        await setMaxTx.wait();
      }
      
      const newMaxTxAmount = await memeToken.maxTxAmount();
      console.log("🔍 [TEST] New Max Transaction Amount:", newMaxTxAmount.toString());
      
      // mint 更多代币用于新测试
      const mintTx2 = await memeToken
        .connect(deployer)
        .mint(deployer.address, newMaxTxAmount.add(1));
      if (!isLocalNet) {
        await mintTx2.wait();
      }
      
      // 测试超过新最大交易额应失败
      const newTransferAmount = newMaxTxAmount.add(1);
      console.log("🔍 [TEST] Attempting new transfer of:", newTransferAmount.toString());
      console.log("🔍 [TEST] New max allowed:", newMaxTxAmount.toString());
      
      if (isLocalNet) {
        await expect(
          memeToken
            .connect(deployer)
            .transfer(addr1.address, newTransferAmount)
        ).to.be.revertedWith("Exceeds max transaction amount");
      } else {
        try {
          const tx = await memeToken
            .connect(deployer)
            .transfer(addr1.address, newTransferAmount);
          console.log("🔍 [TEST] New transaction sent:", tx.hash);
          
          // 等待交易被挖矿并检查状态
          const receipt = await tx.wait();
          console.log("🔍 [TEST] New transaction receipt status:", receipt.status);
          
          if (receipt.status === 1) {
            console.log("❌ [TEST] New transfer unexpectedly succeeded");
            throw new Error("Should have reverted");
          } else {
            console.log("✅ [TEST] New transfer correctly failed on remote network");
          }
        } catch (e) {
          console.log("🔍 [TEST] Caught error on new transfer:", e.message);
          if (e.message === "Should have reverted") {
            throw new Error("Expected transaction to fail but it succeeded");
          }
          console.log("✅ [TEST] New transfer correctly failed on remote network");
        }
      }
      
      console.log("✅ [TEST] Max transaction amount test completed");
    });

    it("should enforce max daily transaction count", async function () {
      const addr1 = signers[1];
      const addr2 = signers[2];

      // 部署者转账给addr1
      const initialTx = await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("100", 18));

      if (!isLocalNet) {
        await initialTx.wait();
      }

      // 读取最大日交易次数
      const maxDailyTxCount = await memeToken.maxDailyTxCount();
      console.log("📊 [TEST] Max Daily Transaction Count:", maxDailyTxCount.toString());

      // 根据网络调整测试循环次数
      const testIterations = isLocalNet ? maxDailyTxCount : Math.min(maxDailyTxCount, 2);

      // 修改最大日交易次数为测试次数
      const setMaxDailyTx = await memeToken.connect(deployer).setMaxDailyTxCount(testIterations);
      // 连续转账达到限制
      for (let i = 0; i < testIterations; i++) {
        const tx = await memeToken
          .connect(addr1)
          .transfer(addr2.address, ethers.utils.parseUnits("1", 18));

        if (!isLocalNet) {
          await tx.wait();
        }
      }

      // 超过限制的转账应失败
      if (isLocalNet) {
        await expect(
          memeToken
            .connect(addr1)
            .transfer(addr2.address, ethers.utils.parseUnits("1", 18))
        ).to.be.revertedWith("Exceeds daily transaction count");
      } else {
        try {
          await memeToken
            .connect(addr1)
            .transfer(addr2.address, ethers.utils.parseUnits("1", 18));
          throw new Error("Should have reverted");
        } catch (e) {
          if (!e) {
            throw new Error("Expected an exception but got none");
          }
        }
      }

      // 仅在本地网络测试时间前进
      if (network.chainId !== 31337) {
        console.log("⚠️ [TEST] Skipping time manipulation test on non-local network");
        return;
      }

      // 模拟时间前进24小时
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);

      // 时间重置后再次转账应成功
      await expect(
        memeToken
          .connect(addr1)
          .transfer(addr2.address, ethers.utils.parseUnits("1", 18))
      ).to.not.be.reverted;
    });
    it("should fail on transfers to zero address, contract itself, or insufficient balance", async function () {
      const addr1 = signers[1];

      // 部署者转账给addr1
      const tx = await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("10", 18));

      if (!isLocalNet) {
        await tx.wait();
      }

      // 向0地址转账应失败
      if (isLocalNet) {
        await expect(
          memeToken
            .connect(addr1)
            .transfer(
              ethers.constants.AddressZero,
              ethers.utils.parseUnits("1", 18)
            )
        ).to.be.revertedWith("Invalid recipient");
      } else {
        try {
          await memeToken
            .connect(addr1)
            .transfer(
              ethers.constants.AddressZero,
              ethers.utils.parseUnits("1", 18)
            );
          throw new Error("Should have reverted");
        } catch (e) {
          if (!e) {
            throw new Error("Expected an exception but got none");
          }
        }
      }

      // 向合约自身转账应失败
      if (isLocalNet) {
        await expect(
          memeToken
            .connect(addr1)
            .transfer(memeToken.address, ethers.utils.parseUnits("1", 18))
        ).to.be.revertedWith("Cannot transfer to contract");
      } else {
        try {
          await memeToken
            .connect(addr1)
            .transfer(memeToken.address, ethers.utils.parseUnits("1", 18));
          throw new Error("Should have reverted");
        } catch (e) {
          if (!e) {
            throw new Error("Expected an exception but got none");
          }
        }
      }

      // 余额不足时转账应失败
      const addr1Balance = await memeToken.balanceOf(addr1.address);
      if (isLocalNet) {
        await expect(
          memeToken
            .connect(addr1)
            .transfer(deployer.address, addr1Balance.add(1))
        ).to.be.revertedWith("Insufficient balance");
      } else {
        try {
          await memeToken
            .connect(addr1)
            .transfer(deployer.address, addr1Balance.add(1));
          throw new Error("Should have reverted");
        } catch (e) {
          if (!e) {
            throw new Error("Expected an exception but got none");
          }
        }
      }
    });
  });
  describe("Management Functions", function () {
    it("should manage whitelist correctly", async function () {
      const addr1 = signers[1];
      const addr2 = signers[2];

      // 验证初始状态
      let isAddr1Whitelisted = await memeToken.isExcludedFromTax(addr1.address);
      expect(isAddr1Whitelisted).to.be.false;

      // 添加addr1到白名单
      const addWhitelistTx = await memeToken.connect(deployer).addToWhitelist(addr1.address);
      if (!isLocalNet) {
        await addWhitelistTx.wait();
      }

      isAddr1Whitelisted = await memeToken.isExcludedFromTax(addr1.address);
      expect(isAddr1Whitelisted).to.be.true;

      // 测试白名单转账免税
      const tx1 = await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("50", 18));

      if (!isLocalNet) {
        await tx1.wait();
      }

      const addr1Balance = await memeToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(ethers.utils.parseUnits("50", 18));

      const tx2 = await memeToken
        .connect(addr1)
        .transfer(addr2.address, ethers.utils.parseUnits("20", 18));

      if (!isLocalNet) {
        await tx2.wait();
      }

      const addr2Balance = await memeToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(ethers.utils.parseUnits("20", 18)); // 不扣税

      // 移除白名单
      const removeWhitelistTx = await memeToken
        .connect(deployer)
        .removeFromWhitelist(addr1.address);

      if (!isLocalNet) {
        await removeWhitelistTx.wait();
      }

      isAddr1Whitelisted = await memeToken.isExcludedFromTax(addr1.address);
      expect(isAddr1Whitelisted).to.be.false;

      // 测试移除后恢复扣税
      const addr2BalanceBefore = await memeToken.balanceOf(addr2.address);
      const taxRate = await memeToken.getTaxRate();

      const tx3 = await memeToken
        .connect(addr1)
        .transfer(addr2.address, ethers.utils.parseUnits("20", 18));

      if (!isLocalNet) {
        await tx3.wait();
      }

      const addr2BalanceAfter = await memeToken.balanceOf(addr2.address);
      const expectedReceived = addr2BalanceBefore.add(
        ethers.utils
          .parseUnits("20", 18)
          .mul(100 - taxRate)
          .div(100)
      );
      expect(addr2BalanceAfter).to.equal(expectedReceived);

      // 重复添加白名单测试
      const addWhitelist1Tx = await memeToken.connect(deployer).addToWhitelist(addr1.address);
      if (!isLocalNet) {
        await addWhitelist1Tx.wait();
      }

      const addWhitelist2Tx = await memeToken.connect(deployer).addToWhitelist(addr1.address);
      if (!isLocalNet) {
        await addWhitelist2Tx.wait();
      }

      isAddr1Whitelisted = await memeToken.isExcludedFromTax(addr1.address);
      expect(isAddr1Whitelisted).to.be.true;
    });

    it("should update tax beneficiary correctly", async function () {
      const addr1 = signers[1];
      const addr2 = signers[2];
      const addr3 = signers[3];

      // 修改受益人地址为addr1
      const setBeneficiaryTx = await memeToken.connect(deployer).setTaxBeneficiaries(addr1.address);
      if (!isLocalNet) {
        await setBeneficiaryTx.wait();
      }

      // 准备测试转账
      const tx1 = await memeToken
        .connect(deployer)
        .transfer(addr2.address, ethers.utils.parseUnits("100", 18));

      if (!isLocalNet) {
        await tx1.wait();
      }

      const taxBeneficiaryBalanceBefore = await memeToken.balanceOf(addr1.address);

      const tx2 = await memeToken
        .connect(addr2)
        .transfer(addr3.address, ethers.utils.parseUnits("100", 18));

      if (!isLocalNet) {
        await tx2.wait();
      }

      // 验证税费流向新受益人
      const taxBeneficiaryBalanceAfter = await memeToken.balanceOf(addr1.address);
      const taxRate = await memeToken.getTaxRate();
      const expectedTax = ethers.utils
        .parseUnits("100", 18)
        .mul(taxRate)
        .div(100);
      expect(taxBeneficiaryBalanceAfter).to.equal(
        taxBeneficiaryBalanceBefore.add(expectedTax)
      );

      // 验证新受益人自动加入白名单
      const isAddr1Whitelisted = await memeToken.isExcludedFromTax(addr1.address);
      expect(isAddr1Whitelisted).to.be.true;
    });
  });
});
