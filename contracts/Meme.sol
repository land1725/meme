// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.4.0
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MemeToken is ERC20, ERC20Burnable, Ownable {

    // 设置代币税比例
    uint256 private taxRate = 5; // 5%
    // 设置转账白名单
    mapping(address => bool) private _isExcludedFromTax;
    // 添加消费税受益者地址
    address private _taxBeneficiaries;
    // 设置单笔交易最大额度（防止大户操纵市场）
    uint256 public maxTxAmount = 100000 * 10 ** decimals(); // 100000 个代币
    // 设置单日交易次数上限（防止频繁交易）
    uint256 public maxDailyTxCount = 10;
    mapping(address => uint256) private _dailyTxCount;
    mapping(address => uint256) private _lastTxTimestamp;
    
    // 事件定义
    event TaxCollected(address indexed from, address indexed beneficiary, uint256 amount);
    event WhitelistUpdated(address indexed account, bool excluded);
    event TaxRateUpdated(uint256 oldRate, uint256 newRate);
    event TaxBeneficiaryUpdated(address indexed oldBeneficiary, address indexed newBeneficiary);   

    constructor( address initialOwner, address taxBeneficiary)
        ERC20("MemeToken", "Meme")
        Ownable(initialOwner)
    {
        require(initialOwner != address(0), "Invalid owner");
        require(taxBeneficiary != address(0), "Invalid tax beneficiary");
        
        _mint(initialOwner, 10000 * 10 ** decimals());
        
        // 设置税费受益者
        _taxBeneficiaries = taxBeneficiary;
        
        // 设置转账白名单
        _isExcludedFromTax[initialOwner] = true;
        _isExcludedFromTax[address(this)] = true;
        _isExcludedFromTax[taxBeneficiary] = true;
        
        emit WhitelistUpdated(initialOwner, true);
        emit WhitelistUpdated(address(this), true);
        emit WhitelistUpdated(taxBeneficiary, true);
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
    function transfer(address to, uint256 value) public override returns (bool) {
        return _transferWithTax(msg.sender, to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, value);
        return _transferWithTax(from, to, value);
    }
    
    function _transferWithTax(address from, address to, uint256 value) internal returns (bool) {
        // 检验to是否是合法地址
        require(to != address(0), "Invalid recipient");
        require(to != address(this), "Cannot transfer to contract");
        // 检查发送者余额是否足够
        require(balanceOf(from) >= value, "Insufficient balance");
        // 检查单笔交易额度
        require(value <= maxTxAmount, "Exceeds max transaction amount");
        
        // 更新单日交易次数和时间戳 (CEI: 先更新状态)
        _updateDailyTxCount(from);
        
        // 检查单日交易次数
        require(_dailyTxCount[from] <= maxDailyTxCount, "Exceeds daily transaction count");
        
        // 如果发送者或接收者在白名单中，则不扣税
        if (_isExcludedFromTax[from] || _isExcludedFromTax[to]) {
            _transfer(from, to, value);
        } else {
            require(_taxBeneficiaries != address(0), "Tax beneficiary not set");
            uint256 taxAmount = (value * taxRate) / 100;
            uint256 netAmount = value - taxAmount;
            
            // 执行转账
            if (taxAmount > 0) {
                _transfer(from, _taxBeneficiaries, taxAmount);
                emit TaxCollected(from, _taxBeneficiaries, taxAmount);
            }
            _transfer(from, to, netAmount);
        }
        
        return true;
    }
    
    function _updateDailyTxCount(address account) internal {
        // 白名单地址不计入交易次数
        if (_isExcludedFromTax[account]) {
            return;
        }
        if (block.timestamp - _lastTxTimestamp[account] >= 1 days) {
            _dailyTxCount[account] = 1;
        } else {
            _dailyTxCount[account] += 1;
        }
        _lastTxTimestamp[account] = block.timestamp;
    }
    // 添加白名单地址
    function addToWhitelist(address account) public onlyOwner {
        require(account != address(0), "Invalid address");
        _isExcludedFromTax[account] = true;
        emit WhitelistUpdated(account, true);
    }
    
    // 从白名单移除地址
    function removeFromWhitelist(address account) public onlyOwner {
        _isExcludedFromTax[account] = false;
        emit WhitelistUpdated(account, false);
    }
    
    // 设置税率
    function setTaxRate(uint256 newTaxRate) public onlyOwner {
        require(newTaxRate <= 25, "Tax rate too high"); // 最大25%
        require(newTaxRate >= 0, "Tax rate cannot be zero");// 最小0%
        uint256 oldRate = taxRate;
        taxRate = newTaxRate;
        emit TaxRateUpdated(oldRate, newTaxRate);
    }
    
    // 设置交易限制
    function setMaxTxAmount(uint256 newMaxTxAmount) public onlyOwner {
        require(newMaxTxAmount > 0, "Invalid amount");
        maxTxAmount = newMaxTxAmount;
    }
    
    function setMaxDailyTxCount(uint256 newMaxCount) public onlyOwner {
        require(newMaxCount > 0, "Invalid count");
        maxDailyTxCount = newMaxCount;
    }
    
    // 查询函数
    function isExcludedFromTax(address account) public view returns (bool) {
        return _isExcludedFromTax[account];
    }
    
    function getTaxBeneficiary() public view returns (address) {
        return _taxBeneficiaries;
    }
    
    function getDailyTxCount(address account) public view returns (uint256) {
        return _dailyTxCount[account];
    }
    
    function getLastTxTimestamp(address account) public view returns (uint256) {
        return _lastTxTimestamp[account];
    }

    // 获取代币税率
    function getTaxRate() public view returns (uint256) {
        return taxRate;
    }
    
    // 设置代币税受益者地址
    function setTaxBeneficiaries(address newBeneficiary) public onlyOwner {
        require(newBeneficiary != address(0), "Invalid address");
        address oldBeneficiary = _taxBeneficiaries;
        _taxBeneficiaries = newBeneficiary;
        
        // 更新白名单
        _isExcludedFromTax[newBeneficiary] = true;
        emit WhitelistUpdated(newBeneficiary, true);
        emit TaxBeneficiaryUpdated(oldBeneficiary, newBeneficiary);
    }
}
