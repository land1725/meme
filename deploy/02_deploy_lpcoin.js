module.exports = async ({ getNamedAccounts, deployments, ethers }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // 获取部署账户
  console.log("Deploying contracts with the account:", deployer);
  
  // 获取账户余额
  const balance = await ethers.provider.getBalance(deployer);
  console.log("Account balance:", ethers.utils.formatEther(balance), "ETH");

  // 获取已经部署的 MemeToken 合约地址
  const memeToken = await deployments.get("MemeToken");
  console.log("MemeToken address:", memeToken.address);

  await deploy("LpToken", {
    from: deployer,
    contract: "LiquidityPoolManager", // 指定使用 LiquidityPoolManager.sol 中的 LpToken 合约
    // 代币名称
    args: [deployer,memeToken.address], 
    log: true,
  });
}
module.exports.tags = ["LpToken"];
module.exports.dependencies = ['MemeToken'];