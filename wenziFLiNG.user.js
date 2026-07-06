// ==UserScript==
// @name         文字修仙风灵月影
// @namespace    https://xiuxian.wenzi.games
// @version      1.0.0
// @description  自动探索秘境（遇怪自动战斗） + 骰子游戏必胜（冷却1秒）
// @author       ehekatle
// @downloadURL  https://cdn.gh-proxy.org/https://raw.githubusercontent.com/ehekatle/wenziFLiNG/main/wenziFLiNG.user.js
// @match        https://xiuxian.wenzi.games/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ========== 功能一：自动探索秘境 ==========
    const MOVE_INTERVAL_MIN = 10;
    const MOVE_INTERVAL_MAX = 50;

    let moveTimer = null;
    let battleActive = false;
    const directions = ['w', 'a', 's', 'd'];

    function log(msg) {
        console.log(`[自动探索 ${new Date().toLocaleTimeString()}] ${msg}`);
    }

    function pressKey(key) {
        log(`模拟按键: ${key}`);
        window.dispatchEvent(new KeyboardEvent('keydown', {
            key: key,
            code: 'Key' + key.toUpperCase(),
            keyCode: key.charCodeAt(0),
            which: key.charCodeAt(0),
            bubbles: true,
            cancelable: true
        }));
    }

    function isMapPage() {
        return window.location.hash === '#/map';
    }

    function isBattlePage() {
        return window.location.hash === '#/explore';
    }

    function stopMove() {
        if (moveTimer) {
            clearInterval(moveTimer);
            moveTimer = null;
            log('移动已停止');
        }
    }

    function startMove() {
        if (moveTimer) return;
        if (!isMapPage()) {
            log('不在地图页面，不启动移动');
            return;
        }
        log('开始自动移动');
        moveTimer = setInterval(() => {
            if (isBattlePage()) {
                stopMove();
                if (!battleActive) doBattle();
                return;
            }
            if (!isMapPage()) {
                stopMove();
                return;
            }
            const dir = directions[Math.floor(Math.random() * directions.length)];
            log(`移动: ${dir}`);
            pressKey(dir);
        }, MOVE_INTERVAL_MIN + Math.random() * (MOVE_INTERVAL_MAX - MOVE_INTERVAL_MIN));
    }

    function doBattle() {
        if (battleActive) {
            log('战斗流程已在进行中');
            return;
        }
        battleActive = true;
        stopMove();
        log('进入战斗处理（将自动 Q + 等1秒 + F）');

        // 按 Q 攻击
        setTimeout(() => {
            log('按下 Q 攻击');
            pressKey('q');
        }, 400);

        // 按 F 继续探索
        setTimeout(() => {
            log('按下 F 继续探索');
            pressKey('f');
        }, 1400);

        // F 后 1 秒检查并强制恢复
        setTimeout(() => {
            log('F 后检查页面状态');
            if (isMapPage()) {
                // 已回到地图，直接开始移动
                log('已回到地图，开始移动');
                battleActive = false;
                startMove();
            } else {
                // 还在战斗页或其他页，再按一次 F，并重置状态
                log('未回到地图，重置战斗状态并补按 F');
                battleActive = false;
                pressKey('f');
                // 再等 1 秒做最后一次检查
                setTimeout(() => {
                    if (isMapPage() && !moveTimer) {
                        log('二次检查：已回到地图，开始移动');
                        startMove();
                    } else if (isBattlePage()) {
                        log('二次检查：仍在战斗页，再次补 F');
                        pressKey('f');
                    }
                }, 1000);
            }
        }, 1000);
    }

    // hashchange 快速响应
    window.addEventListener('hashchange', () => {
        const newHash = window.location.hash;
        log(`hash 变化检测: ${newHash}`);
        if (newHash === '#/map') {
            if (battleActive) {
                log('战斗结束，回到地图');
                battleActive = false;
            }
            startMove();
        } else if (newHash === '#/explore') {
            if (!battleActive) {
                doBattle();
            }
        }
    });

    // 初始化
    function initExplore() {
        const currentHash = window.location.hash;
        log(`初始化，当前 hash: ${currentHash}`);
        if (currentHash === '#/map') {
            startMove();
        } else if (currentHash === '#/explore') {
            doBattle();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExplore);
    } else {
        initExplore();
    }
})();

(function() {
    'use strict';

    // ========== 功能二：骰子游戏必胜 + 1秒冷却 ==========
    let diceElement = null;
    let isRolling = false;
    let randomCallCount = 0;
    let timeOffset = 0;
    let offsetTimeoutId = null;
    let rollingObserver = null;
    let bodyObserver = null;

    // 原始函数引用
    const originalRandom = Math.random;
    const originalDateNow = Date.now;

    /**
     * 从DOM获取当前下注类型
     * @returns {'big'|'small'|'odd'|'even'|null}
     */
    function getBetType() {
        try {
            const checkedLabel = document.querySelector('.dice-game .el-radio.is-checked .el-radio__label');
            if (!checkedLabel) return null;
            const text = checkedLabel.textContent.trim();
            const map = { '大': 'big', '小': 'small', '单': 'odd', '双': 'even' };
            return map[text] || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * 根据下注类型计算必胜的Math.random返回值
     */
    function getVictoryRandom(betType) {
        switch (betType) {
            case 'big':   return 0.92;  // 6点，同时满足大和双
            case 'small': return 0.05;  // 1点，同时满足小和单
            case 'odd':   return 0.75;  // 5点，同时满足单和大
            case 'even':  return 0.92;  // 6点，同时满足双和大
            default:      return 0.92;
        }
    }

    /**
     * 查找骰子元素
     */
    function findDiceElement() {
        return document.querySelector('.dice-game .dice');
    }

    /**
     * 检查骰子是否正在滚动
     */
    function checkIsRolling() {
        if (!diceElement) return false;
        return diceElement.classList.contains('rolling');
    }

    /**
     * 检查冷却倒计时是否可见
     */
    function isInCooldown() {
        const countdown = document.querySelector('.dice-game .el-countdown');
        return !!countdown && countdown.offsetParent !== null;
    }

    // ---- 核心劫持 ----
    function setupRandomHijack() {
        Math.random = function () {
            if (!isRolling) {
                randomCallCount = 0;
                return originalRandom.call(Math);
            }

            randomCallCount++;
            // 滚动总共20次，前15次保持随机效果，后5次保证胜利
            if (randomCallCount >= 16) {
                const betType = getBetType();
                if (betType) {
                    return getVictoryRandom(betType);
                }
            }
            return originalRandom.call(Math);
        };
    }

    function restoreRandomHijack() {
        Math.random = originalRandom;
    }

    function setupDateNowHijack() {
        Date.now = function () {
            return originalDateNow.call(Date) + timeOffset;
        };
    }

    function restoreDateNowHijack() {
        Date.now = originalDateNow;
    }

    function startCooldownAcceleration() {
        if (offsetTimeoutId) {
            clearTimeout(offsetTimeoutId);
            offsetTimeoutId = null;
        }
        timeOffset = 599000; // 10分钟 - 1秒
        offsetTimeoutId = setTimeout(() => {
            timeOffset = 0;
            offsetTimeoutId = null;
        }, 1000);
    }

    function clearExistingCooldown() {
        if (offsetTimeoutId) {
            clearTimeout(offsetTimeoutId);
            offsetTimeoutId = null;
        }
        timeOffset = 599000;
        offsetTimeoutId = setTimeout(() => {
            timeOffset = 0;
            offsetTimeoutId = null;
        }, 800);
    }

    // ---- DOM 观察 ----
    function observeDiceElement(el) {
        if (rollingObserver) {
            rollingObserver.disconnect();
            rollingObserver = null;
        }

        diceElement = el;
        isRolling = el.classList.contains('rolling');
        randomCallCount = 0;

        rollingObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const wasRolling = isRolling;
                    isRolling = el.classList.contains('rolling');

                    if (!wasRolling && isRolling) {
                        randomCallCount = 0;
                    }

                    if (wasRolling && !isRolling) {
                        randomCallCount = 0;
                        setTimeout(() => {
                            startCooldownAcceleration();
                        }, 50);
                    }
                }
            }
        });

        rollingObserver.observe(el, {
            attributes: true,
            attributeFilter: ['class']
        });

        isRolling = el.classList.contains('rolling');
    }

    function setupBodyObserver() {
        if (bodyObserver) {
            bodyObserver.disconnect();
        }

        bodyObserver = new MutationObserver(() => {
            const el = findDiceElement();

            if (el && el !== diceElement) {
                observeDiceElement(el);
            }

            if (!el && diceElement) {
                if (rollingObserver) {
                    rollingObserver.disconnect();
                    rollingObserver = null;
                }
                diceElement = null;
                isRolling = false;
                randomCallCount = 0;
            }
        });

        bodyObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // ---- 初始化 ----
    function initDice() {
        setupRandomHijack();
        setupDateNowHijack();

        const el = findDiceElement();
        if (el) {
            observeDiceElement(el);
        }

        setupBodyObserver();

        if (isInCooldown()) {
            clearExistingCooldown();
        }

        setInterval(() => {
            if (isInCooldown() && timeOffset === 0 && !offsetTimeoutId) {
                clearExistingCooldown();
            }
        }, 2000);

        console.log('[骰子必胜助手] 已激活 - 下注必胜 + 1秒冷却');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initDice, 500);
        });
    } else {
        setTimeout(initDice, 500);
    }
})();
