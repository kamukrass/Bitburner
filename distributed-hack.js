// file: distributed-hack.js

// Detailed explanation at the end of the file.

// hack severs for this much of their money
// the money ratio is increased and decreased automatically, starting with this value initially
var hackMoneyRatio = 0.1;

// the maximum numberof parallel burst attacks against one server
// the value of this variable should not make a big difference however
var maxParallelAttacks = 50;

// time to wait between checking and calculating new attacks (in ms) 
const waitTimeBetweenManagementCycles = 1000;

// time difference between finishing [ hack - grow - weaken ] in burst attacks (in ms)
const timeDiff = 200;

// time between burst attacks. Needs to be bigger than 2 * time diff (in ms)
const timeBetweenAttacks = 500;

// Potential issue with burst attack timing: 
// Hacking skill might increase after launching them while hack / grow wait before they start. 
// Execution time is calculated when launching the attack but can decrease with higher hacking skill.
// Thus fast growing hacking skill can get burst attacks out of sync. In such situations it's steamrolling mode anyways, so who cares...
// Higher time diff / between attacks reduce this issue plus reduce the load on the real CPU running the game

// RAM requirement of the slave scripts for weak, grow & hack
// actually it's 1.7 for hack and 1.75 for weak & grow. Let's always use 1.75 for simpicity
// hard-coded to save RAM by not having to get ram via ns function
const slaveScriptRam = 1.75;

// names of the slave scripts
const weakenScriptName = "weaken.js";
const growScriptName = "grow.js";
const hackScriptName = "hack.js";
const shareScriptName = "share.js";
const shareScriptRam = 4;

// list of slave script files
const files = [weakenScriptName, growScriptName, hackScriptName];

// Backdoor script hooked in (requires singluarity functions SF4.1)
const singularityFunctionsAvailable = true;
const backdoorScript = "backdoor.js"
const backdoorScriptRam = 5.8;

// Solve Contract Script hooked in 
const solveContractsScript = "solve-contracts.js";
const solveContractsScriptRam = 22;

// global variable to track ongoing partial weak or grow attacks
var partialWeakGrow = null; // do not change this

// global variable to track amount of recent partial attacks
var partialAttacks = 1;

// hard-coded values to save RAM by not using ns functions ...AnalyzeSecurity()
const growThreadSecurityIncrease = 0.004;
const hackThreadSecurityIncrease = 0.002;

var profitsm = new Map();

/** @param {NS} ns **/
export async function main(ns) {
    // Disable default Logging
    ns.disableLog("ALL");

    // automatically backdoor these servers. Requires singularity functions.
    var backdoorServers = new Set(["CSEC", "I.I.I.I", "avmnite-02h", "run4theh111z", "clarkinc", "nwo", "omnitek", "fulcrumtech", "fulcrumassets", "w0r1d_d43m0n"]);

    var servers;
    var targets;
    var freeRams;
    var ramUsage;

    // initially set hackMoneyRatio based on progress measured by home server RAM
    var homeRam = ns.getServerMaxRam("home");
    if (homeRam >= 65536) {
        hackMoneyRatio = 0.99;
        ns.tprint("Increase hackMoneyRatio to " + hackMoneyRatio)
    }
    else if (homeRam >= 16384) {
        hackMoneyRatio = 0.9;
        ns.tprint("Increase hackMoneyRatio to " + hackMoneyRatio)
    }
    else if (homeRam > 8192) {
        hackMoneyRatio = 0.5;
        ns.tprint("Increase hackMoneyRatio to " + hackMoneyRatio)
    }
    else if (homeRam > 2048) {
        hackMoneyRatio = 0.2;
        ns.tprint("Increase hackMoneyRatio to " + hackMoneyRatio)
    }
    ns.print("INFO initial hack money ratio: " + hackMoneyRatio);

    var growStocks = new Set();
    var hackStocks = new Set();

    var moneyXpShare = false
    var shareThreadIndex = 0;

    while (true) {
        // scan and nuke all accesible servers
        servers = await scanAndNuke(ns);
        // ns.print(`servers:${[...servers.values()]}`)

        for (var server of servers) {
            // transfer files to the servers
            await ns.scp(files, "home", server);
            // ToDo: Not efficient to loop through all servers always. Could be optimized to track which server was optimized and scp only once.

            // backdoor faction servers automatically requires singularity module
            // modify singularityFunctionsAvailable at the top to de- / activate
            if (singularityFunctionsAvailable == true) {
                for (var backdoorServer of backdoorServers.values()) {
                    if (server == backdoorServer) {
                        if (ns.getServerRequiredHackingLevel(server) <= ns.getHackingLevel()) {
                            const homeMaxRam = ns.getServerMaxRam("home");
                            const homeUsedRam = ns.getServerUsedRam("home")
                            const homeFreeRam = homeMaxRam - homeUsedRam;
                            if (homeFreeRam >= backdoorScriptRam) {
                                const backdoorSuccess = ns.exec(backdoorScript, "home", 1, server);
                                ns.print("INFO backdoor on " + server + " - " + backdoorSuccess);
                                backdoorServers.delete(backdoorServer);
                            }
                        }
                    }
                }
            }
        }

        // find servers with free RAM and calculate free RAM for each plus overall available RAM
        freeRams = getFreeRam(ns, servers);
        //ns.tprint(`freeRams:${freeRams.map(value => JSON.stringify(value))}`)

        // filter servers for those which we can hack and sort them
        targets = getHackable(ns, servers);
        // ns.print(`targets:${[...targets.values()]}`)

        // update servers for stock market manipulation
        growStocks = getStockPortContent(ns, 1, growStocks); // port 1 is grow
        hackStocks = getStockPortContent(ns, 2, hackStocks); // port 2 is hack

        var portHandle = ns.getPortHandle(3); // port 3 is player control currenty for money + xpWeaken, money + share or share only
        //var firstPortElement = portHandle.peek();
        if (!portHandle.empty()) {
            // hack for money and experience: money-xp
            // hack for money and faction reputation: money-share
            // hack for faction reputation only: share-only
            moneyXpShare = portHandle.read();
        }

        // Main logic sits here, determine whether or not and how many threads we should call weaken, grow and hack
        var attacksLaunched = manageAndHack(ns, freeRams, servers, targets, growStocks, hackStocks);

        if (attacksLaunched > 0) {
            // Adjust hackMoneyRatio
            ramUsage = (freeRams.overallMaxRam - freeRams.overallFreeRam) / freeRams.overallMaxRam;
            //ns.print("Partial attacks: " + partialAttacks);
            //ns.print("RAM usage: " + ramUsage);
            if (partialAttacks == 0 && ramUsage < 0.95 && hackMoneyRatio < 0.99) {
                hackMoneyRatio += (1 - hackMoneyRatio) * (1 - ramUsage) * attacksLaunched;
                if (hackMoneyRatio > 0.99) {
                    hackMoneyRatio = 0.99;
                }
                ns.print("INFO increase hack money ratio to: " + hackMoneyRatio.toFixed(2));
            }
            else if (partialAttacks > 4 && ramUsage > 0.9 && hackMoneyRatio > 0.01) {
                hackMoneyRatio -= hackMoneyRatio / 10;
                if (hackMoneyRatio < 0.01) {
                    hackMoneyRatio = 0.01;
                }
                partialAttacks = 3;
                ns.print("INFO decrease hack money ratio to: " + hackMoneyRatio.toFixed(2));
            }
        }

        // Hook for solve contracts script here if enough RAM is free.
        const homeMaxRam = ns.getServerMaxRam("home");
        const homeUsedRam = ns.getServerUsedRam("home")
        const homeFreeRam = homeMaxRam - homeUsedRam;
        if (homeFreeRam > solveContractsScriptRam) {
            //ns.print("INFO checking for contracts to solve");
            ns.exec(solveContractsScript, "home");
        }

        if (moneyXpShare && hackMoneyRatio >= 0.99) {
            const maxRam = ns.getServerMaxRam("home");
            const usedRam = ns.getServerUsedRam("home")
            var freeRam = maxRam - usedRam;
            var shareThreads = Math.floor(freeRam / shareScriptRam);
            if (shareThreads > 0) {
                ns.print("INFO share threads " + shareThreads);
                ns.exec(shareScriptName, "home", shareThreads, shareThreadIndex);
                if (shareThreadIndex > 9) {
                    shareThreadIndex = 0;
                }
                else {
                    shareThreadIndex++;
                }
                freeRams.overallFreeRam -= shareThreads * shareScriptRam;
            }
        }

        // if lots of RAM to spare and money is not an issue, spam weak attacks for hacking XP gain
        if (ramUsage < 0.8 && hackMoneyRatio >= 0.99) {
            xpWeaken(ns, freeRams, servers, targets);
            ramUsage = (freeRams.overallMaxRam - freeRams.overallFreeRam) / freeRams.overallMaxRam;
        }

        //ns.print("INFO RAM utilization: " + Math.round(ramUsage * 100) + " % ");

        await ns.sleep(waitTimeBetweenManagementCycles);
    }
}

function manageAndHack(ns, freeRams, servers, targets, growStocks, hackStocks) {
    var attacksLaunched = 0;
    for (let target of targets) {
        // check if there is already an attack against this target ongoing
        if (attackOngoing(ns, servers, target) == true) {
            // skip the target if there is already an attack ongoing because 
            // we cannot determine a perfect attack strategy without interfering with the ongoing attack
            continue;
        }

        const minSec = ns.getServerMinSecurityLevel(target);
        const sec = ns.getServerSecurityLevel(target);
        var addedGrowSecurity = 0;
        var addedHackSecurity = 0;
        var money = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);
        var weakThreads = 0;
        var growThreads = 0;
        var hackThreads = 0;

        var secDiff = sec - minSec

        if (secDiff < 0.5) {
            // server is near min security. Go ahead with grow or hack.

            if (money < 1) {
                // ensure money > 0 to prevent division by zero or hackAnalyze zero
                // just in case a server was 100% hacked with no money left
                money = 1;
            }
            var initialGrowRatio = maxMoney / money;
            var hackReGrowRatio = 1;
            var overallGrowRatio = 1;

            // hack if near max money (no substantial growth needed) 
            if (initialGrowRatio < 1.1) {

                hackThreads = Math.floor(ns.hackAnalyzeThreads(target, hackMoneyRatio * money));

                //ns.print("Hack threads: " + hackThreads);

                // the grow ratio needed after the hack. Example: 50% of max money requires to grow by a factor of 2
                // also consinder initial missing money difference

                // expected grow ratio needed to re-grow the hacked money after hack
                hackReGrowRatio = 1 / (1 - hackMoneyRatio);

                addedHackSecurity = hackThreads * hackThreadSecurityIncrease;
            }
            else {
                //ns.print("WARN initial grow ratio: " + initialGrowRatio + " on target " + target);
            }

            // grow what was missing before and what we expect to hack
            // multiply the initial grow ratio by the expected new grow ratio needed after hack
            overallGrowRatio = initialGrowRatio * hackReGrowRatio;

            // compensate reduced grow effect in WGH after H due to security increase
            overallGrowRatio *= (sec + addedHackSecurity) / sec;

            // Considering 0 cores on all serers. 
            // The last parameter 0 can be removed if optimizing for running slave threads on home server with > 0 cores only
            // else, grow threads onother servers than home will not grow sufficiently and break perfect attack chains
            growThreads = Math.ceil((ns.growthAnalyze(target, overallGrowRatio, 0)));

            addedGrowSecurity = growThreads * growThreadSecurityIncrease;
        }
        else {
            //ns.print("INFO Initial security difference: " + secDiff);
        }
        weakThreads = Math.ceil((secDiff + addedGrowSecurity + addedHackSecurity) * 20);

        var overallRamNeed = ((weakThreads + growThreads + hackThreads) * slaveScriptRam);

        //ns.tprint("partialWeakGrow: " + partialWeakGrow + " target: " + target);

        var weakTime = ns.getWeakenTime(target);
        var growTime = ns.getGrowTime(target);
        var hackTime = ns.getHackTime(target);
        var maxPercentage = 1;
        var parallelAttacks = 1;
        if (overallRamNeed > freeRams.overallFreeRam) {
            // only attack if there is no other partial attack ongoing or if we want to hack.
            // this is to spend RAM on hacking, while not initially weakening and growing servers we would not hack yet anyways
            // early money is useful for server purchases to speed up RAM gain 
            // prevent partially weakening / growing multiple servers in parallel. Focus on few servers initially. 

            if (partialAttacks < 9) {
                //ns.print("incerase partial attacks " + partialAttacks)
                partialAttacks++;
            }

            maxPercentage = freeRams.overallFreeRam / overallRamNeed;
            if (partialWeakGrow == null || partialWeakGrow == target || hackThreads > 0) {
                if (hackThreads > 0) {
                    if (maxPercentage < 0.05) {
                        //ns.print("INFO skip small attack on " + target);
                        // too small attacks are not efficient, let's wait until we can at least perform 5 % of a full attack
                        //ns.print("INFO skip because low RAM for attack on " + target);
                        continue;
                    }
                    // we only have enough RAM for maxPercentage of our hack Threads. 
                    var reducedHackMoneyRatio = hackMoneyRatio * maxPercentage;

                    // in case we were not at max servermoney, also consider RAM neeed for initial growth on the target
                    // reduce hack money ratio to not run out of RAM
                    reducedHackMoneyRatio /= initialGrowRatio;

                    // TODO: Let's ignore initial security weaken RAM need for the calculation for now.
                    // If RAM calculation throws warnings, wecould check for that or live with it.

                    // TODO: This calculation is not optimal since growth is not linear. 
                    // Example: With 50% of the hack threads, we need less than 50% of the grow threads, 
                    //      so we could hack for more than * maxPercentage 
                    // => we leave a negligible small percentage of the RAM unused. 

                    hackThreads = Math.floor(ns.hackAnalyzeThreads(target, reducedHackMoneyRatio * money));
                    if (hackThreads < 1) {
                        hackThreads = 1;
                    }

                    //ns.print("Reduced hack threads: " + hackThreads)
                    addedHackSecurity = hackThreads * hackThreadSecurityIncrease;
                    hackReGrowRatio = 1 / (1 - reducedHackMoneyRatio);
                    overallGrowRatio = initialGrowRatio * hackReGrowRatio;
                    growThreads = Math.floor((ns.growthAnalyze(target, overallGrowRatio, 0)));
                    addedGrowSecurity = growThreads * growThreadSecurityIncrease;

                    weakThreads = Math.floor((secDiff + addedGrowSecurity + addedHackSecurity) * 20);
                    //if (hackThreads < 1 || weakThreads < 1) {
                    // we planned to hack but we have so small free RAM that it got divided and rounded down to zero 
                    // abort to not waste resources
                    //return;
                    //}

                    if (partialWeakGrow == target) {
                        // if we ran a partial weak/grow before and could do a full one now, reset partial attack
                        partialWeakGrow = null;
                    }
                    //ns.print("INFO " + maxPercentage.toFixed(1) + " WGH " + target + " " + weakThreads + " | " + growThreads + " | " + hackThreads);

                }
                else { //hackthreads == 0
                    growThreads = Math.floor(growThreads * maxPercentage);

                    addedGrowSecurity = growThreads * growThreadSecurityIncrease;
                    weakThreads = Math.floor((secDiff + addedGrowSecurity) * 20);

                    if ((growThreads < 1 || weakThreads < 1) && secDiff < 0.5) {
                        // not an attack to initially weaken and got divided and rounded down to zero due to low RAM
                        break;
                    }
                    // we have only enough RAM to partially grow this target
                    partialWeakGrow = target;
                    //ns.print("INFO " + maxPercentage.toFixed(1) + "  GW " + target + " " + weakThreads + " | " + growThreads + " | " + hackThreads);
                }
            }
            else {
                // no good partial attack strategy found for this target.
                //ns.print("INFO low RAM - no partial attack on " + target + " hack " + hackThreads);
                //ns.print("INFO partialWeakGrow: " + partialWeakGrow);
                continue;
            }

        }
        else if (hackThreads == 0) {
            // regular attack
            //ns.print("INFO 1    GW " + target + " " + weakThreads + " | " + growThreads + " | " + hackThreads);
            if (partialWeakGrow == target) {
                // if we ran a partial weak/grow before and could do a full one now, reset partial attack
                partialWeakGrow = null;
            }
        }
        else { // enough RAM for at least full attack with hack
            if (partialWeakGrow == target) {
                // if we ran a partial weak/grow before and could do a full one now, reset partial attack
                partialWeakGrow = null;
            }
            if (partialAttacks > 0) {
                //ns.print("Decrease partial attacks " + partialAttacks);
                partialAttacks--;
            }

            // try to run multiple attacks in parallel against the target if enough RAM available

            var maxAttacksDuringHack = Math.floor((weakTime - timeBetweenAttacks) / timeBetweenAttacks);
            var moreRamNeed = 0;

            for (parallelAttacks = 1; parallelAttacks < maxAttacksDuringHack; parallelAttacks++) {
                // do not run parallel attacks if running partial or low percentage attacks
                if (hackMoneyRatio < 0.5) {
                    break;
                }
                // check if we have enough RAM for one more attack
                moreRamNeed = ((weakThreads * (parallelAttacks + 1) + growThreads * (parallelAttacks + 1) +
                    hackThreads * (parallelAttacks + 1)) * slaveScriptRam);
                if (moreRamNeed >= freeRams.overallFreeRam) {
                    // we do not have enough RAM for more attacks
                    break;
                }
                else if (parallelAttacks >= maxParallelAttacks) {
                    // check if max parallel attacks have been limited by global variable
                    break;
                }
                else if (parallelAttacks >= maxAttacksDuringHack) {
                    // check if max parallel attacks have been limited 
                    break;
                }
                else if ((freeRams.overallFreeRam / freeRams.overallMaxRam < 0.1 || partialAttacks > 2) && (partialWeakGrow != null || freeRams.overallMaxRam < 512)) {
                    // if we are low on RAM, go for single attacks for better efficiency
                    break;
                }
                // increment parallel attacks via for loop
            }
            //ns.print("INFO " + parallelAttacks + "   WGH " + target + " " + weakThreads + " | " + growThreads + " | " + hackThreads);
        }

        // re-calculate overall RAM need after scaling full attacs down or up
        overallRamNeed = ((weakThreads + growThreads + hackThreads) * slaveScriptRam) * parallelAttacks;
        if (overallRamNeed > freeRams.overallFreeRam) {
            // Typically, there should be enough RAM for the planned attack. Warn if not.
            ns.print("WARN RAM calculation issue for target: " + target + " need / free: " + overallRamNeed + " / " + freeRams.overallFreeRam);
        }
        freeRams.overallFreeRam -= overallRamNeed;

        // by default, no sleep time for threads
        var weakSleep = 0;
        var growSleep = 0;
        var hackSleep = 0;

        // calculate sleep times for threads in one attack in case of multiple parallel attacks against one target
        // weaken is always longest and hack always shortest
        // we need to finish hack, then grow, then weaken with gaps of timeDiff ms
        // weak is always has 0 sleep difference within one attack
        if (parallelAttacks > 1) {
            // grow should finish timediff ms before weaken finishes
            growSleep = (weakTime - growTime) - timeDiff;
            if (growSleep < 0) {
                // make sure that we do not get negative sleep value in case of crazy low execution times
                // in this case, tweak time between attacks and time diff
                ns.print("WARN: time synchronisation issue for parallel attacks");
                growSleep = 0;
                parallelAttacks = 1;
            }
            hackSleep = (weakTime - hackTime) - 2 * timeDiff;
            if (hackSleep < 0) {
                // make sure that we do not get negative sleep value in case of crazy low execution times
                // in this case, tweak time between attacks and time diff
                hackSleep = 0;
                growSleep = 0;
                parallelAttacks = 1;
                ns.print("WARN time synchronisation issue for parallel attacks");
            }

            if (hackThreads == 0) {
                ns.print("WARN " + parallelAttacks + " parallel attacks with hack threads = " + hackThreads);
            }
        }

        // var profit = money * maxPercentage * ns.hackAnalyzeChance(target) / (hackThreads + growThreads + weakThreads);
        // Could use hackAnalyzeChance for better value rating - costs ram however
        
        var profit = money * maxPercentage / (hackThreads + growThreads + weakThreads);
        var profitM = profit * 60 / weakTime;
        profitsm.set(target, profitM);

        if (parallelAttacks <= 1) {
            ns.print("INFO " + maxPercentage.toFixed(1) + " WGH " + target + " " + weakThreads + " | " + growThreads + " | " + hackThreads + " | $/t/s " + profitM.toFixed(2));
        }
        else {
            ns.print("INFO " + parallelAttacks + "   WGH " + target + " " + weakThreads + " | " + growThreads + " | " + hackThreads + " | $/t/s " + profitM.toFixed(2));
        }

        var growStock = growStocks.has(target);
        var hackStock = hackStocks.has(target);

        if (growStock) {
            ns.print("INFO GRW stock " + target);
        }
        if (hackStock) {
            ns.print("INFO HCK stock " + target);
        }

        for (var i = 0; i < parallelAttacks; i++) {
            if (hackThreads > 0) {
                if (!findPlaceToRun(ns, hackScriptName, hackThreads, freeRams.serverRams, target, hackSleep, hackStock)) {
                    ns.print("WARN Did not find a place to run hack " + target + " needs " + overallRamNeed)
                }
            }
            if (weakThreads > 0) {
                if (!findPlaceToRun(ns, weakenScriptName, weakThreads, freeRams.serverRams, target, weakSleep)) {
                    ns.print("WARN Did not find a place to run weaken " + target + " needs " + overallRamNeed)
                }
            }
            if (growThreads > 0) {
                if (!findPlaceToRun(ns, growScriptName, growThreads, freeRams.serverRams, target, growSleep, growStock)) {
                    ns.print("WARN Did not find a place to run grow " + target + " needs " + overallRamNeed)
                }
            }

            weakSleep += timeBetweenAttacks;
            growSleep += timeBetweenAttacks;
            hackSleep += timeBetweenAttacks;
            attacksLaunched++;
        }
        
    }
    return attacksLaunched;
}

function xpWeaken(ns, freeRams, servers, targets) {

    // let weken threads for XP farming sleep for this amount of ms
    // Needed to discriminate from regular weaken threads (with sleep 0)
    // other weaken threads should never sleep for 1 ms
    const xpWeakSleep = 1;

    const playerHackingLevel = ns.getHackingLevel();
    targets.sort((a, b) => weakenXPgainCompare(ns, playerHackingLevel, a) - weakenXPgainCompare(ns, playerHackingLevel, b))

    for (let target of targets) {
        if (xpAttackOngoing(ns, servers, target, xpWeakSleep) == false) {
            // we have free RAM for this many weak threads
            var weakThreads = freeRams.overallFreeRam / slaveScriptRam;
            // however, do not use all of it, only use a part of it to leave some buffer for the hack threads
            weakThreads = Math.floor(weakThreads * 0.6);
            if (weakThreads > 0) {
                ns.print("WARN XP weaken attack on " + target + " with " + weakThreads);
                if (!findPlaceToRun(ns, weakenScriptName, weakThreads, freeRams.serverRams, target, xpWeakSleep)) {
                    ns.print("WARN Did not find a place to run XP weaken " + target)

                }
                return;
            }
        }
    }
}

function weakenXPgainCompare(ns, playerHackingLevel, target) {
    // not actual XP, but the factor to calculate it
    const xpPerWeaken = ((playerHackingLevel - ns.getServerRequiredHackingLevel(target)) / playerHackingLevel);
    const xpPerTime = xpPerWeaken / ns.getWeakenTime(target);
    return xpPerTime;
}

// find some place to run the script with given amount of threads
// returns true means script was executed, false means it didnt
function findPlaceToRun(ns, script, threads, freeRams, target, sleepTime, manipulateStock = false) {
    while (freeRams.length > 0) {
        // try with first availiable host
        var host = freeRams[0].host;
        var ram = freeRams[0].freeRam;

        // if not enough ram on host to even run 1 thread, remove the host from list
        if (ram < slaveScriptRam) {
            freeRams.shift();

            // else if the ram on the host is not enough to run all threads, just run as much as it can
        }
        else if (ram < slaveScriptRam * threads) {
            const threadForThisHost = Math.floor(ram / slaveScriptRam);
            if (manipulateStock) {
                ns.exec(script, host, threadForThisHost, target, sleepTime, manipulateStock);
            }
            else {
                ns.exec(script, host, threadForThisHost, target, sleepTime);
            }
            threads -= threadForThisHost;
            freeRams.shift();
        }
        else { // enough RAM on this host to run all threads
            if (manipulateStock) {
                ns.exec(script, host, threads, target, sleepTime, manipulateStock)
            }
            else {
                ns.exec(script, host, threads, target, sleepTime);
            }
            freeRams[0].freeRam -= slaveScriptRam * threads;
            return true;
        }
    }

    // we did not find enough RAM to run all remaining threads. Something went from in the RAM calculation
    ns.print("WARN missing " + slaveScriptRam * threads + " for " + script + " RAM for target " + target);
    return false;
}

// check whether there is already an attack against a target ongoing
function attackOngoing(ns, servers, target) {
    var weakSleep = 0;
    for (let server of servers.values()) {
        for (let parallelAttack = 0; parallelAttack < maxParallelAttacks; parallelAttack++) {
            // we know the sleep time for weaken threads (not easy to obtain for grow and hack)
            // checking for weak threads is sufficient to determine if attack is ongoing sonce they take longest
            // since weaken takes longest always and we always have weaken in our attacks, no weaken -> no attack ongoing
            weakSleep = parallelAttack * timeBetweenAttacks;
            let weakenRunning = ns.isRunning(weakenScriptName, server, target, weakSleep);
            //let growScript = ns.getRunningScript(growScriptName, server, hackable);
            //let hackScript = ns.getRunningScript(hackScriptName, server, hackable);
            if (weakenRunning == true) {
                // there are running weaken threads against the target
                if (weakSleep == 1) {
                    ns.tprint("Weaksleep 1 found!");
                }
                return true;
            }
        }
    }

    // we did not find running weaken threads against the target on the servers
    return false;
}

// check whether there is already an attack against a target ongoing
function xpAttackOngoing(ns, servers, target, weakSleep) {
    for (let server of servers.values()) {
        let weakenRunning = ns.isRunning(weakenScriptName, server, target, weakSleep);
        if (weakenRunning == true) {
            // there are running weaken threads against the target
            return true;
        }
    }
    // we did not find running weaken threads against the target on the servers
    return false;
}

// filter and sort the list for hackable servers
function getHackable(ns, servers) {

    var sortedServers = [...servers.values()].filter(server => ns.getServerMaxMoney(server) > 100000
        && ns.getServerRequiredHackingLevel(server) <= ns.getHackingLevel()
        && ns.getServerGrowth(server) > 1 && server != "n00dles").sort((a, b) =>
            profitsm["get"](b) - profitsm["get"](a))
            // unnatural usage of "get" to avoid stanek.get RAM calculation bug

    if (partialWeakGrow != null) {
        // prioritize a server which we have not initialized yet
        sortedServers.unshift(partialWeakGrow);
    }

    return sortedServers

    //.sort((a, b) => 5 * ns.getServerMinSecurityLevel(a) - 5 * ns.getServerMinSecurityLevel(b)
    //    + ns.getServerGrowth(b) - ns.getServerGrowth(a))
    // TODO:
    // the sort here ranks the hackable servers by "best server to hack"
    // Up to now this is just an educated guess and this can be optimized
    // minSec determines the execution times and growth the needed grow threads.
    // not sure how to value these in comparison plus whether and how to consider max available money on a hackable server 
}

// filter the list for servers where we can run script on
function getFreeRam(ns, servers) {
    var serverRams = [];
    var overallFreeRam = 0;
    var overallMaxRam = 0;

    for (let server of servers) {
        const maxRam = ns.getServerMaxRam(server);
        const usedRam = ns.getServerUsedRam(server)
        var freeRam = maxRam - usedRam;
        // round down to full hack slots
        freeRam = Math.floor(freeRam / slaveScriptRam) * slaveScriptRam
        overallMaxRam += maxRam;
        if (freeRam >= slaveScriptRam) {
            serverRams.push({ host: server, freeRam: freeRam });
            overallFreeRam += freeRam;
        }
    }
    // deploy threads on servers with lots of free RAM first
    serverRams.sort((a, b) => b.freeRam - a.freeRam);
    // move home server to last position to keep RAM free for player stuff there
    serverRams.sort((a, b) => (a.host == "home") - (b.host == "home"));

    return { serverRams, overallFreeRam, overallMaxRam };
}

// scan all servers from home and nuke them if we can
async function scanAndNuke(ns) {
    let servers = new Set(["home"]);
    scanAll(ns, "home", servers);
    var accessibleServers = new Set();
    for (let server of servers) {
        if (server.startsWith("hacknet-node")) { continue; } // for BitNode 9 to permit hacking on the Hacknet Servers
        if (await ns.hasRootAccess(server)) {
            accessibleServers.add(server)
        } else {
            var portOpened = 0;
            if (await ns.fileExists("BruteSSH.exe")) {
                await ns.brutessh(server);
                portOpened++;
            }
            if (await ns.fileExists("FTPCrack.exe")) {
                await ns.ftpcrack(server);
                portOpened++;
            }
            if (await ns.fileExists("HTTPWorm.exe")) {
                await ns.httpworm(server);
                portOpened++;
            }
            if (await ns.fileExists("relaySMTP.exe")) {
                await ns.relaysmtp(server);
                portOpened++;
            }
            if (await ns.fileExists("SQLInject.exe")) {
                await ns.sqlinject(server);
                portOpened++;
            }
            if (await ns.getServerNumPortsRequired(server) <= portOpened) {
                await ns.nuke(server);
                accessibleServers.add(server);
            }
        }
    }
    return accessibleServers;
}

function scanAll(ns, host, servers) {
    var hosts = ns.scan(host);
    for (let i = 0; i < hosts.length; i++) {
        if (!servers.has(hosts[i])) {
            servers.add(hosts[i]);
            scanAll(ns, hosts[i], servers);
        }
    }
}

export function getStockPortContent(ns, portNumber, content) {
    var portHandle = ns.getPortHandle(portNumber);
    var firstPortElement = portHandle.peek();
    if (firstPortElement == "NULL PORT DATA") {
        // no new data available
        return content;
    } else if (firstPortElement == "EMPTY") {
        // "EMPTY" means that the list shall be set to empty
        portHandle.clear();
        return new Set();
    }
    else { // list shall be updated
        content = new Set();
        while (!portHandle.empty()) {
            content.add(portHandle.read());
        }
    }
    return content;
}

/*
Design goals

    Utilize as much of the available RAM as possible at all times

    Utilize the RAM as efficiently as possible, which means only perfect attack patterns using different strategies and

    Adapt to any situation automatically (early - late game)

WGH attack patterns

Baseline is one WGH pattern: (H)ack, Re-(G)row the money hacked and (W)eaken the security added. For a detailed description see Bitburner Hacking Algorithms. Anticipate the amount of grow and weaken needed for your hack beforehand. Deploy all three in parallel in specialized scripts on servers. Attack a server with min security and max money (weaken + grow initially).

The WGH pattern has one variable for tuning: The percentage of money hacked. Re-growth need does not scale linearly with hack: Twice the amount of hack threads requires more than twice the amount of grow threads. Thus it is more RAM efficient to hack for small percentages of money only; bigger attacks are less RAM efficient.

The basic WGH attack pattern can be scaled in two ways based on the amount of free RAM available:

    Adjust the percentage of money to hack per WGH

    Attack multiple servers in parallel

So early game, the optimal strategy is to continuously attack all possible servers in parallel with almost all available RAM using the WGH pattern with a low percentage of money hacked. If not enough RAM available for the intended percentage of money to hack, go for the biggest percentage possible.

Also note that hack threads finish way earlier than grow or weak threads. That means RAM which becomes available after hack finishes, while grow and weak are still running from one WGH pattern: That RAM can be used immediately for something else. Example:

    Start "WGH" attack on server n00dles.

    "H" finishes. Use that free RAM from "H" for WGH attack on server foodnstuff.

    "GW" from noodles finish.

WGH batch attack patterns

At some point in time there is enough RAM available to fully hack all servers perfectly for 99.9% of their money continuously. More RAM cannot be put to use. Now comes the next mechanic and variable for tuning into play: Batch WGH attacks. WGH batch attacks are timed so that H, G + W all finish within a short amount of time by delaying the start of H and G (W always takes longest). Using normal WGH attacks, you can attack once during the time W runs (often: minutes). With batch attacks which are timed to 1 second or less, you can attack one server once every second! (over-simplified [technical details], see later).

Batch attacks are extremely powerful, why not use them always? Remember that regular WGH attacks free up RAM from finished H attacks that can be used already while the "GW" attack continues. Especially early-game, the majority of threads in an WGH pattern are hack threads (late game: grow). So while batch attacks can use up to 100% RAM, many threads will just wait for some time before they start - while blocking the RAM. So the RAM is not efficiently used (for just waiting).

Thus regular WGH attacks are optimal early-game until they cannot use more RAM anymore. Then batch attacks become the optimal strategy for utilizing more RAM.

The limit for batch attacks comes with the [technical details] mentioned in the over-simplification above: The targeted server needs to be at min sec when threads are started. So we cannot start any new attacks while running attacks are hitting the target. Example: An WGH execution time takes 10 seconds. We chain 9 attacks in parallel each with 1 second delay from the previous one. Then the 9 attacks are hitting for 10 seconds and during that time we cannot guarantee that the server has min security or max money. We need to wait until the running attack batch is finished before starting the next batch.

So batch attacks can scale up to a certain extent when run against all servers at maximum potential. Then, more RAM cannot be used anymore. At this point in time money income  will most likely be absurdly too much to spend. However the game might not be finished just with money. Another benefit of hacking is experience gain. So at later stages, experience gain can be increased by just spamming useless W attacks.

On top of that, the script features ports to receive hack or grow orders for certain servers in order to manipulate the stock market.
Potential weaknesses

    Where is the rocket science about "which is the best server to hack"? It does matter, but not much with this strategy since we attack many servers simultaneously. Up to now a rather simple ranking function is used.

    Depending on how big the impact of "best" vs "worst" servers to hack is, it might actually be more "effective" to "inefficiently" hack the "best" server than to "efficiently" hack all servers. Or in other words, batch attacking a high value server might be the better approach than single-attacking multiple servers.

    This approach utilizes resources to initially weaken and grow all servers. So the money income starts slow early game while initializing servers without hacking them. To limit resources spent on initializing many servers in parallel and prioritize resources on hacking few servers (WGH), RAM utilization is sometimes not optimized early game on purpose. Approaches with faster money income ramp-up time can enable buying more servers faster for more RAM.

    The dynamic situation analysis for continuously choosing and tuning the strategy is not too highly sophisticated. Tailoring an attack strategy for a certain situation and time interval can certainly beat the situation analysis here

    This approach does not contribute anything while offline

Summary

The optimal strategy depends on and changes with the situation.

    Early game: Regular WGH attacks, scale with money hacked & multiple targets

    Mid game: Switch from WGH to Batch attacks, scale with batch size & multiple targets

    Late game: Use free RAM for spamming W to gain exp
*/
