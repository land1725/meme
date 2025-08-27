// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// 导入需要攻击的接口
interface ILpToken {
    function mint(address to, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function addLiquidity(uint256 memeAmount, uint256 minLpTokens) external payable;
}

interface IMemeToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

/**
 * @title ReentrancyAttacker
 * @dev 用于测试重入攻击防护的简单攻击合约
 */
contract ReentrancyAttacker {
    ILpToken public lpToken;
    IMemeToken public memeToken;
    bool public attacking = false;
    uint256 public attackCount = 0;
    
    constructor(address _lpTokenAddress, address _memeTokenAddress) {
        lpToken = ILpToken(_lpTokenAddress);
        memeToken = IMemeToken(_memeTokenAddress);
    }
    
    /**
     * @dev 发起攻击的函数
     */
    function attack() external payable {
        require(!attacking, "Already attacking");
        require(msg.value > 0, "Need ETH for attack");
        
        // 检查是否有足够的 meme 代币
        uint256 memeBalance = memeToken.balanceOf(address(this));
        require(memeBalance > 0, "Need MEME tokens for attack");
        
        // 授权 LP 合约使用 meme 代币
        memeToken.approve(address(lpToken), memeBalance);
        
        attacking = true;
        attackCount = 0;
        
        // 尝试进行重入攻击 - 调用有 nonReentrant 保护的函数
        // addLiquidity 函数有 nonReentrant 保护，会触发重入检测
        // 提供较小的 meme 数量，但大量的 ETH，这会导致多余 ETH 被退回，触发 receive()
        uint256 smallMemeAmount = memeBalance / 10; // 只使用 10% 的代币
        lpToken.addLiquidity{value: msg.value}(smallMemeAmount, 0);
        
        attacking = false;
    }
    
    /**
     * @dev 接收 ETH 的回退函数，用于模拟重入攻击
     */
    receive() external payable {
        if (attacking && attackCount < 2) {
            attackCount++;
            // 在收到 ETH 退款时尝试重新调用有保护的函数
            // 这会触发重入保护机制
            uint256 memeBalance = memeToken.balanceOf(address(this));
            if (memeBalance > 0) {
                lpToken.addLiquidity{value: msg.value}(memeBalance / 20, 0);
            }
        }
    }
    
    /**
     * @dev 获取合约的 LP Token 余额
     */
    function getLpBalance() external view returns (uint256) {
        return lpToken.balanceOf(address(this));
    }
    
    /**
     * @dev 提取 ETH（仅用于测试）
     */
    function withdraw() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}
