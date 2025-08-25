module.exports = async ({ getNamedAccounts, deployments, ethers }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // 获取部署账户
  console.log("Deploying contracts with the account:", deployer);
  
  // 获取账户余额
  const balance = await ethers.provider.getBalance(deployer);
  console.log("Account balance:", ethers.utils.formatEther(balance), "ETH");

  console.log("测试部署脚本完成！");

  await deploy("MemeToken", {
    from: deployer,
    // 代币名称
    args: [deployer,deployer], 
    log: true,
  });
}
module.exports.tags = ["MemeToken"];