// 测试套件1：合约初始化验证
const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");
describe("MemeToken Contract", function () {
  // 测试套件1：合约初始化验证

  let memeToken;
  let deployer, taxBeneficiary;
  beforeEach(async function () {
    console.log("1. Starting test setup...");

    // 获取部署账户和其他测试账户
    [deployer] = await ethers.getSigners();
    taxBeneficiary = deployer; // 这里假设税费受益人也是部署者
    console.log("2. Got signers, deployer:", deployer.address);
    console.log("2. Got signers, taxBeneficiary:", taxBeneficiary.address);

    // 部署合约
    console.log("3. Running deployments.fixture...");
    await deployments.fixture(["MemeToken"]);
    console.log("4. Deployments completed");

    console.log("5. Getting contract...");
    const deployment = await deployments.get("MemeToken");
    memeToken = await ethers.getContractAt(
      "MemeToken",
      deployment.address,
      deployer
    );
    console.log("MemeToken deployed to:", memeToken.address);
    console.log("6. Test setup completed!");
  });

  describe("测试套件1：合约初始化验证", function () {
    // 1. 验证初始化参数• 检查代币名称/符号是否正确• 验证初始发行量是否全部分配给部署者• 验证初始白名单地址（部署者/合约地址/税费受益人）
    // 2:非owner调用mint函数应失败，非owner修改税率应失败，非owner修改白名单应失败
    it("should deploy successfully", function () {
      expect(memeToken.address).to.not.be.undefined;
      console.log("Test passed: MemeToken deployed successfully");
    });

    // 检查代币名称/符号是否正确
    it("should have correct name and symbol", async function () {
      const name = await memeToken.name();
      const symbol = await memeToken.symbol();
      expect(name).to.equal("MemeToken");
      expect(symbol).to.equal("Meme");
    });

    // 验证初始发行量是否全部分配给部署者
    it("should assign total supply to deployer", async function () {
      const totalSupply = await memeToken.totalSupply();
      const deployerBalance = await memeToken.balanceOf(deployer.address);
      console.log("Total Supply:", totalSupply.toString());
      console.log("Deployer Balance:", deployerBalance.toString());
      expect(deployerBalance).to.equal(totalSupply);
    });

    // 验证初始白名单地址
    it("should have correct initial whitelist addresses", async function () {
      const isDeployerWhitelisted = await memeToken.isExcludedFromTax(
        deployer.address
      );
      const isContractWhitelisted = await memeToken.isExcludedFromTax(
        memeToken.address
      );
      const isTaxBeneficiaryWhitelisted = await memeToken.isExcludedFromTax(
        taxBeneficiary.address
      );
      expect(isDeployerWhitelisted).to.be.true;
      expect(isContractWhitelisted).to.be.true;
      expect(isTaxBeneficiaryWhitelisted).to.be.true;
    });
    // 1.4 非owner调用mint函数应失败
    it("should fail if non-owner calls mint", async function () {
      const [_, addr1] = await ethers.getSigners();
      console.log("Non-owner address:", addr1.address);
      await expect(
        memeToken.connect(addr1).mint(addr1.address, 100)
      ).to.be.revertedWithCustomError(memeToken, "OwnableUnauthorizedAccount");
    });
    // 非owner修改税率应失败
    it("should fail if non-owner calls setTaxRate", async function () {
      const [_, addr1] = await ethers.getSigners();
      console.log("Non-owner address:", addr1.address);
      await expect(
        memeToken.connect(addr1).setTaxRate(5)
      ).to.be.revertedWithCustomError(memeToken, "OwnableUnauthorizedAccount");
    });
    // 非owner修改白名单应失败
    it("should fail if non-owner calls addToWhitelist", async function () {
      const [_, addr1] = await ethers.getSigners();
      console.log("Non-owner address:", addr1.address);
      await expect(
        memeToken.connect(addr1).addToWhitelist(addr1.address)
      ).to.be.revertedWithCustomError(memeToken, "OwnableUnauthorizedAccount");
    });
  });

  // 测试套件2：转账税收机制
  describe("测试套件2：转账税收机制", function () {
    // 白名单间转账不应扣税
    it("should transfer tokens without tax between whitelisted addresses", async function () {
      // 白名单向普通地址转账接收方是否扣税
      const [_, addr1] = await ethers.getSigners();
      await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("50", 18));
      const addr1Balance = await memeToken.balanceOf(addr1.address);
      console.log("addr1 Balance:", addr1Balance.toString());
      expect(addr1Balance).to.equal(ethers.utils.parseUnits("50", 18));
      // 普通地址向白名单转账接收方是否扣税
      const deployerBalanceBefore = await memeToken.balanceOf(deployer.address);
      await memeToken
        .connect(addr1)
        .transfer(deployer.address, ethers.utils.parseUnits("20", 18));
      const addr1BalanceAfter = await memeToken.balanceOf(addr1.address);
      expect(addr1BalanceAfter).to.equal(ethers.utils.parseUnits("30", 18));
      const deployerBalanceAfter = await memeToken.balanceOf(deployer.address);
      expect(deployerBalanceAfter).to.equal(
        deployerBalanceBefore.add(ethers.utils.parseUnits("20", 18))
      );
    });
    //验证5%基础税率计算准确性
    // 检查税费是否准确转入受益人地址
    it("should apply 5% tax on transfers between non-whitelisted addresses", async function () {
      const [_, addr1, addr2] = await ethers.getSigners();
      // 部署者转账给addr1转100，addr1给address2转100，addr1收到的金额应扣除5%税费
      await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("100", 18));
      const addr1Balance = await memeToken.balanceOf(addr1.address);
      // addr1给address2转100，address2应扣除5%税费
      const taxBeneficiaryBalanceBefore = await memeToken.balanceOf(
        taxBeneficiary.address
      );
      await memeToken
        .connect(addr1)
        .transfer(addr2.address, ethers.utils.parseUnits("100", 18));
      const addr2Balance = await memeToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(ethers.utils.parseUnits("95", 18)); // 100 - 5% = 95
      // 验证税费是否转入税费受益人地址（部署者）
      const taxBeneficiaryBalanceAfter = await memeToken.balanceOf(
        taxBeneficiary.address
      );
      console.log(
        "Tax Beneficiary Balance:",
        taxBeneficiaryBalanceAfter.toString()
      );
      expect(taxBeneficiaryBalanceAfter).to.equal(
        taxBeneficiaryBalanceBefore.add(ethers.utils.parseUnits("5", 18))
      ); // 5
    });
    //   验证TaxCollected事件参数正确性
    it("should emit TaxCollected event with correct parameters", async function () {
      const [_, addr1, addr2] = await ethers.getSigners();
      // 部署者转账给addr1转100
      await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("100", 18));
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
    // 修改税率为25%时可以正常转账
    it("should apply 25% tax when tax rate is 25", async function () {
      await memeToken.connect(deployer).setTaxRate(25);
      const [_, addr1, addr2] = await ethers.getSigners();
      // 部署者转账给addr1转100

      await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("100", 18));
      // addr1给address2转100，address2应扣除25%税费
      await memeToken
        .connect(addr1)
        .transfer(addr2.address, ethers.utils.parseUnits("100", 18));
      const addr2Balance = await memeToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(ethers.utils.parseUnits("75", 18)); // 100 - 25% = 75
    });
    // 修改税率为0%时可以正常转账
    it("should apply 0% tax when tax rate is 0", async function () {
      await memeToken.connect(deployer).setTaxRate(0);
      const [_, addr1, addr2] = await ethers.getSigners();
      // 部署者转账给addr1转100
      await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("100", 18));
      // addr1给address2转100，address2应扣除0%税费
      await memeToken
        .connect(addr1)
        .transfer(addr2.address, ethers.utils.parseUnits("100", 18));
      const addr2Balance = await memeToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(ethers.utils.parseUnits("100", 18)); // 100 - 0% = 100
    });
  });
  //   测试套件3：防滥用机制
  describe("测试套件3：防滥用机制", function () {
    // 3.1 验证最大交易额限制
    it("should enforce max transaction amount", async function () {
      const [_, addr1] = await ethers.getSigners();
      // 部署者转账给addr1超过最大交易额应失败
      const maxTxAmount = await memeToken.maxTxAmount();
      console.log("Max Transaction Amount:", maxTxAmount.toString());
      // deployer mint maxTxAmount+1 给自己保证余额充足
      await memeToken
        .connect(deployer)
        .mint(deployer.address, maxTxAmount.add(1));
      await expect(
        memeToken.connect(deployer).transfer(addr1.address, maxTxAmount.add(1))
      ).to.be.revertedWith("Exceeds max transaction amount");
      // 转账等于最大交易额应成功
      await expect(
        memeToken.connect(deployer).transfer(addr1.address, maxTxAmount)
      ).to.not.be.reverted;
      //   修改最大交易额为原来的一半，转账超过新额度应失败
      await memeToken.connect(deployer).setMaxTxAmount(maxTxAmount.div(2));
      const newMaxTxAmount = await memeToken.maxTxAmount();
      console.log("New Max Transaction Amount:", newMaxTxAmount.toString());
      //   部署者 mint newMaxTxAmount+1 给自己保证余额充足
      await memeToken
        .connect(deployer)
        .mint(deployer.address, newMaxTxAmount.add(1));
      await expect(
        memeToken
          .connect(deployer)
          .transfer(addr1.address, newMaxTxAmount.add(1))
      ).to.be.revertedWith("Exceeds max transaction amount");
    });
    // 单日交易次数限制
    it("should enforce max daily transaction count", async function () {
      const [_, addr1, addr2] = await ethers.getSigners();
      // 部署者转账给addr1
      await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("100", 18));
      //   读取最大日交易次数
      const maxDailyTxCount = await memeToken.maxDailyTxCount();
      console.log("Max Daily Transaction Count:", maxDailyTxCount.toString());
      // addr1连续转账超过最大日交易次数应失败
      for (let i = 0; i < maxDailyTxCount; i++) {
        await memeToken
          .connect(addr1)
          .transfer(addr2.address, ethers.utils.parseUnits("1", 18));
      }
      await expect(
        memeToken
          .connect(addr1)
          .transfer(addr2.address, ethers.utils.parseUnits("1", 18))
      ).to.be.revertedWith("Exceeds daily transaction count");
      // 模拟时间前进24小时，注意仅在本地测试网络有效，需要判断网络是否是本地网络
      const network = await ethers.provider.getNetwork();
      if (network.chainId !== 31337) {
        console.log("Skipping time manipulation test on non-local network");
        return;
      }
      console.log("Advancing time by 24 hours...");
      await ethers.provider.send("evm_increaseTime", [24 * 60 * 60]);
      await ethers.provider.send("evm_mine", []);
      // 再次转账应成功
      await expect(
        memeToken
          .connect(addr1)
          .transfer(addr2.address, ethers.utils.parseUnits("1", 18))
      ).to.not.be.reverted;
    });
    // 向0地址转账应失败// 向合约自身转账应失败// 余额不足时转账应失败
    it("should fail on transfers to zero address, contract itself, or insufficient balance", async function () {
      const [_, addr1] = await ethers.getSigners();
      // 部署者转账给addr1
      await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("10", 18));
      // 向0地址转账应失败
      await expect(
        memeToken
          .connect(addr1)
          .transfer(
            ethers.constants.AddressZero,
            ethers.utils.parseUnits("1", 18)
          )
      ).to.be.revertedWith("Invalid recipient");

      // 向合约自身转账应失败
      await expect(
        memeToken
          .connect(addr1)
          .transfer(memeToken.address, ethers.utils.parseUnits("1", 18))
      ).to.be.revertedWith("Cannot transfer to contract");
      // 余额不足时转账应失败
      const addr1Balance = await memeToken.balanceOf(addr1.address);
      console.log("addr1 Balance:", addr1Balance.toString());
      await expect(
        memeToken.connect(addr1).transfer(deployer.address, addr1Balance.add(1))
      ).to.be.revertedWith("Insufficient balance");
    });
  });
  //   测试套件4：管理功能
  describe("Management Functions", function () {
    // 白名单管理
    // 添加地址到白名单后免税验证
    // 移除白名单后应恢复扣税
    // 重复添加白名单处理
    it("should manage whitelist correctly", async function () {
      const [_, addr1, addr2] = await ethers.getSigners();
      // 初始addr1不在白名单
      let isAddr1Whitelisted = await memeToken.isExcludedFromTax(addr1.address);
      expect(isAddr1Whitelisted).to.be.false;
      // 添加addr1到白名单
      await memeToken.connect(deployer).addToWhitelist(addr1.address);
      isAddr1Whitelisted = await memeToken.isExcludedFromTax(addr1.address);
      expect(isAddr1Whitelisted).to.be.true;
      // 从白名单向普通地址转账不应扣税
      await memeToken
        .connect(deployer)
        .transfer(addr1.address, ethers.utils.parseUnits("50", 18));
      const addr1Balance = await memeToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(ethers.utils.parseUnits("50", 18));
      await memeToken
        .connect(addr1)
        .transfer(addr2.address, ethers.utils.parseUnits("20", 18));
      const addr2Balance = await memeToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(ethers.utils.parseUnits("20", 18)); // 不扣税
      // 移除addr1白名单
      await memeToken.connect(deployer).removeFromWhitelist(addr1.address);
      isAddr1Whitelisted = await memeToken.isExcludedFromTax(addr1.address);
      expect(isAddr1Whitelisted).to.be.false;
      // 普通地址向普通地址转账应扣税
      const addr2BalanceBefore = await memeToken.balanceOf(addr2.address);
      // 读取当前税率
      const taxRate = await memeToken.getTaxRate();
      await memeToken
        .connect(addr1)
        .transfer(addr2.address, ethers.utils.parseUnits("20", 18));
      const addr2BalanceAfter = await memeToken.balanceOf(addr2.address);
      const expectedReceived = addr2BalanceBefore.add(
        ethers.utils
          .parseUnits("20", 18)
          .mul(100 - taxRate)
          .div(100)
      );
      expect(addr2BalanceAfter).to.equal(expectedReceived);

      // 重复添加白名单应无影响
      await memeToken.connect(deployer).addToWhitelist(addr1.address);
      await memeToken.connect(deployer).addToWhitelist(addr1.address);
      isAddr1Whitelisted = await memeToken.isExcludedFromTax(addr1.address);
      expect(isAddr1Whitelisted).to.be.true;
    });
    // 受益人更新测试
    // 修改受益人地址后税费流向验证
    // 新受益人自动加入白名单验证
    it("should update tax beneficiary correctly", async function () {
      const [_, addr1, addr2, addr3] = await ethers.getSigners();
      // 初始addr1不在白名单
      let isAddr1Whitelisted = await memeToken.isExcludedFromTax(addr1.address);
      expect(isAddr1Whitelisted).to.be.false;
      // 修改受益人地址为addr1
      await memeToken.connect(deployer).setTaxBeneficiaries(addr1.address);
      // addr2给addr3转账应扣税，税费应转入addr1
      await memeToken
        .connect(deployer)
        .transfer(addr2.address, ethers.utils.parseUnits("100", 18));
      const taxBeneficiaryBalanceBefore = await memeToken.balanceOf(
        addr1.address
      );
      await memeToken
        .connect(addr2)
        .transfer(addr3.address, ethers.utils.parseUnits("100", 18));
      const taxBeneficiaryBalanceAfter = await memeToken.balanceOf(
        addr1.address
      );
      const taxRate = await memeToken.getTaxRate();
      const expectedTax = ethers.utils
        .parseUnits("100", 18)
        .mul(taxRate)
        .div(100);
      expect(taxBeneficiaryBalanceAfter).to.equal(
        taxBeneficiaryBalanceBefore.add(expectedTax)
      );
      // 新受益人addr1应自动加入白名单
      isAddr1Whitelisted = await memeToken.isExcludedFromTax(addr1.address);
      expect(isAddr1Whitelisted).to.be.true;
    });
  });
});
