// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.4.0

pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
// 导入meme代币合约接口
import {MemeToken} from "./Meme.sol";

contract LpToken is ERC20, ERC20Burnable, Ownable {
    // 流动性池中meme代币的数量
    uint256 private _memeCount;
    // 流动性池中eth的数量
    uint256 private _ethCount;
    // meme代币合约地址
    address private immutable memeTokenAddress;
    // 设定swap手续费 (3/1000 = 0.3%)
    uint256 public swapFeeRate = 3;
    
    // 重入保护
    bool private _locked;
    
    // 事件定义
    event LiquidityAdded(address indexed user, uint256 memeAmount, uint256 ethAmount, uint256 lpTokens);
    event LiquidityRemoved(address indexed user, uint256 memeAmount, uint256 ethAmount, uint256 lpTokens);
    event SwapExecuted(address indexed user, uint256 amountIn, uint256 amountOut, bool ethToMeme);
    
    modifier nonReentrant() {
        require(!_locked, "Reentrant call");
        _locked = true;
        _;
        _locked = false;
    }
    constructor( address initialOwner, address _memeTokenAddress)
        ERC20("LpToken", "LP")
        Ownable(initialOwner)
    {
        require(_memeTokenAddress != address(0), "Invalid meme token address");
        memeTokenAddress = _memeTokenAddress;
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
    // 添加流动性
    function addLiquidity(uint256 memeAmount, uint256 minLpTokens) public payable nonReentrant {
        // 验证用户提供的资产数量、比例是否合理
        require(memeAmount > 0, "Invalid meme amount");
        require(msg.value > 0, "Invalid ETH amount");
        
        // 计算并铸造流动性代币给用户
        uint256 lpToMint;

        // 判断是否为首次添加流动性
        if (_memeCount == 0 && _ethCount == 0) {
            // 首次添加流动性：转移代币到合约
            require(MemeToken(memeTokenAddress).transferFrom(msg.sender, address(this), memeAmount), 
                    "Meme transfer failed");
            
            _memeCount = memeAmount;
            _ethCount = msg.value;
            lpToMint = sqrt(memeAmount * msg.value);
        } else {
            // 非首次添加流动性，需按比例添加
            uint256 requiredMeme = msg.value * _memeCount / _ethCount;
            if (memeAmount >= requiredMeme) {
                // 按 requiredMeme 添加
                require(MemeToken(memeTokenAddress).transferFrom(msg.sender, address(this), requiredMeme), 
                        "Meme transfer failed");
                
                // 更新流动性池中资产数量
                _memeCount += requiredMeme;
                _ethCount += msg.value;
                lpToMint = sqrt(requiredMeme * msg.value);
            } else {
                uint256 requiredEth = memeAmount * _ethCount / _memeCount;
                // 按 memeAmount 添加，多余 ETH 退回
                require(msg.value >= requiredEth, "Insufficient ETH amount");
                
                require(MemeToken(memeTokenAddress).transferFrom(msg.sender, address(this), memeAmount), 
                        "Meme transfer failed");
                
                // 更新流动性池中资产数量,多余 ETH 退回给用户
                _memeCount += memeAmount;
                _ethCount += requiredEth;
                if (msg.value > requiredEth) {
                    payable(msg.sender).transfer(msg.value - requiredEth);
                }
                lpToMint = sqrt(memeAmount * requiredEth);
            }
        }
        
        require(lpToMint >= minLpTokens, "Insufficient LP tokens output");
        _mint(msg.sender, lpToMint);
        emit LiquidityAdded(msg.sender, memeAmount, msg.value, lpToMint);
    }
    // 移除流动性
    function removeLiquidity(uint256 lpAmount) public {
        require(lpAmount > 0, "Invalid LP amount");
        require(balanceOf(msg.sender) >= lpAmount, "Insufficient LP balance");
        // 检查用户是否已授权池子合约可以销毁这部分LP Token（例如先approve）
        require(allowance(msg.sender, address(this)) >= lpAmount, "Allowance exceeded");

        // 计算用户应得的资产数量
        uint256 memeAmount = lpAmount * _memeCount / totalSupply();
        uint256 ethAmount = lpAmount * _ethCount / totalSupply();

        // 销毁用户的LP Token
        _burn(msg.sender, lpAmount);

        // 返还用户的资产
        MemeToken(memeTokenAddress).transfer(msg.sender, memeAmount);
        payable(msg.sender).transfer(ethAmount);
        // 更新流动性池中资产数量
        _memeCount -= memeAmount;
        _ethCount -= ethAmount;
    }
    // 用户提供ETH，交换Meme代币
    function swapEthForMeme(uint256 minMemeOut) public payable {
        require(msg.value > 0, "Invalid ETH amount");
        // 计算用户实际可用的ETH数量，扣除手续费
        uint256 effectiveEth = msg.value * (1000 - swapFeeRate) / 1000;
        // 计算用户可获得的Meme代币数量，按x*y=k算法
        uint256 memeOut = (_memeCount * effectiveEth) / (_ethCount + effectiveEth);
        require(memeOut >= minMemeOut, "Slippage too high");
        // 更新流动性池中资产数量
        _memeCount -= memeOut;
        _ethCount += effectiveEth;
        // 调用Meme代币合约的transfer方法，把计算出的Meme代币数量从流动性池合约账户转给用户
        bool success = MemeToken(memeTokenAddress).transfer(msg.sender, memeOut);
        require(success, "Meme transfer failed");
    }
    // 用户提供Meme代币，交换ETH
    function swapMemeForEth(uint256 memeIn, uint256 minEthOut) public {
        // 检查输入的Meme代币数量是否合法
        require(memeIn > 0, "Invalid Meme amount");
        // 检查用户余额是否足够
        require(MemeToken(memeTokenAddress).balanceOf(msg.sender) >= memeIn, "Insufficient Meme balance");
        // 检查用户是否已授权池子合约可以转移这部分Meme代币（例如先approve）
        require(MemeToken(memeTokenAddress).allowance(msg.sender, address(this)) >= memeIn, "Allowance exceeded");
        // 计算用户实际可用的Meme数量，扣除手续费
        uint256 effectiveMeme = memeIn * (1000 - swapFeeRate) / 1000;
        // 计算用户可获得的ETH数量，按x*y=k算法
        uint256 ethOut = (_ethCount * effectiveMeme) / (_memeCount + effectiveMeme);
        require(ethOut >= minEthOut, "Slippage too high");
        // 调用Meme代币合约的transferFrom方法，把用户指定数额的Meme代币，扣除手续费后，从用户账户转入流动性池合约自身账户
        bool success = MemeToken(memeTokenAddress).transferFrom(msg.sender, address(this), effectiveMeme);
        require(success, "Meme transfer failed");
        // 更新流动性池中资产数量
        _memeCount += effectiveMeme;
        _ethCount -= ethOut;
        // 调用ETH转账方法，把计算出的ETH数量从流动性池合约账户转给用户
        payable(msg.sender).transfer(ethOut);
    }

    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

}