// hack severs for this much of their money initially
// hack servers never for more than this much of their money
// values above 0.9 do not have a big impact on money (potentially negative if near max RAM usage)
// values above 0.9 are mainly to increase RAM usage in order to get hacking skill faster late-game
// the money ratio is increased automatically, starting with this value
var hackMoneyRatio = 0.1;

// the maximum numberof parallel attacks against one server
// low numbers might be inefficient late-game, high numbers might be inefficient early-game
// reason is that parallel attacks are not as memory-efficient as single or partial attacks
// the purpose of parallel attacks is to use free RAM when we can attack all servers simultaneously
// to attack single servers simultaneously. Parallel attacks need hack threads that wait for a considerable amount of time
// thus blocking free RAM longer that could be used for other attacks.
// the value of this variable should not make a big difference however
var maxParallelAttacks = 50;

// time to wait before checking and calculating new attacks in ms 
const waitTimeBetweenManagementCycles = 1000;


// time difference between finishing [ hack - grow - weaken ] in burst attacks
const timeDiff = 200;

// time between burst attacks. Needs to be bigger than 3 * time diff
const timeBetweenAttacks = 500;

// Known issue with parallel attacks: 
// Hacking skill might increase after launching them while they wait before they start. 
// That can get parallel attacks out of sync and decrease efficiency.

// RAM requirement of the slave scripts for weak, grow & hack
// actually it's 1.7 for hack and 1.75 for weak & grow. Let's always use 1.75 for simpicity.
const slaveScriptRam = 1.75;

// names of the slave scripts
const weakenScriptName = "weaken.js";
const growScriptName = "grow.js";
const hackScriptName = "hack.js";

// list of slave script files
const files = [weakenScriptName, growScriptName, hackScriptName];

const backdoorScript = "backdoor.js"
const backdoorScriptRam = 5.8;
// automatically backdoor these servers. Requires singularity functions.
var backdoorServers = new Set(["CSEC", "I.I.I.I", "avmnite-02h", "run4theh111z"]);

const solveContractsScript = "solve-contracts.js";
const solveContractsScriptRam = 22;

// global variable to track ongoing partial weak or grow attacks
var partialWeakGrow = null; // do not change this

// global variable to track recent partial attacks
var partialAttacks = 1;

const growThreadSecurityIncrease = 0.004;
const hackThreadSecurityIncrease = 0.002;

/** @param {NS} ns **/
export async function main(ns) {
    // Disable default Logging
    ns.disableLog("ALL");
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

    while (true) {
        // scan and hack all accesible servers
        servers = await scanAndHack(ns);
        // ns.tprint(`servers:${[...servers.values()]}`)

        for (var server of servers) {
            // transfer file to server
            await ns.scp(files, "home", server);

            // backdoor faction servers automatically
            // requires singularity module
            for (var backdoorServer of backdoorServers.values()) {
                if (server == backdoorServer) {
                    if (ns.getServerRequiredHackingLevel(server) <= ns.getHackingLevel()) {
                        const homeMaxRam = ns.getServerMaxRam("home");
                        const homeUsedRam = ns.getServerUsedRam("home")
                        const homeFreeRam = homeMaxRam - homeUsedRam;
                        if (homeFreeRam >= backdoorScriptRam) {
                            const backdoorSuccess = ns.exec(backdoorScript, "home", 1, server);
                            ns.print("INFO backdoor on " + server + " - " + backdoorSuccess);
                            if (backdoorSuccess) {
                                backdoorServers.delete(backdoorServer);
                            }
                        }
                    }
                }
            }
        }

        // find servers with free RAM and calculate free RAM for each plus overall max RAM
        freeRams = getFreeRam(ns, servers);
        //ns.tprint(`freeRams:${freeRams.map(value => JSON.stringify(value))}`)

        // find servers that we can hack
        targets = getHackable(ns, servers);
        //ns.tprint(`targets:${[...targets.values()]}`)

        // Main logic sits here, determine whether or not and how many threads we should call weaken, grow and hack  
        manageAndHack(ns, freeRams, servers, targets);

        ramUsage = (freeRams[2] - freeRams[1]) / freeRams[2];
        if (partialAttacks == 0 && ramUsage < 0.9 && hackMoneyRatio < 0.99) {
            hackMoneyRatio += (1 - hackMoneyRatio) * (1 - ramUsage);
            if (hackMoneyRatio > 0.99) {
                hackMoneyRatio = 0.99;
            }
            ns.print("INFO increase hack money ratio to: " + hackMoneyRatio);
        }
        else if (partialAttacks > 2 && ramUsage > 0.99 && hackMoneyRatio > 0.05) {
            hackMoneyRatio -= hackMoneyRatio / 10;
            if (hackMoneyRatio < 0.05) {
                hackMoneyRatio = 0.05;
            }
            ns.print("INFO decrease hack money ratio to: " + hackMoneyRatio);
        }

        const homeMaxRam = ns.getServerMaxRam("home");
        const homeUsedRam = ns.getServerUsedRam("home")
        const homeFreeRam = homeMaxRam - homeUsedRam;
        if (homeFreeRam > solveContractsScriptRam) {
            //ns.print("INFO checking for contracts to solve");
            ns.exec(solveContractsScript, "home");
        }

        // if lots of RAM to spare and money is not an issue, spam weak attacks for hacking XP gain
        if (ramUsage < 0.9 && hackMoneyRatio >= 0.99) {
            xpWeaken(ns, freeRams, servers, targets);
            ramUsage = (freeRams[2] - freeRams[1]) / freeRams[2];
        }

        ns.print("INFO RAM utilization: " + Math.round(ramUsage * 100) + " % ");

        await ns.sleep(waitTimeBetweenManagementCycles);
    }
}


function manageAndHack(ns, freeRams, servers, targets) {
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
        const money = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);
        var weakThreads = 0;
        var growThreads = 0;
        var hackThreads = 0;

        var secDiff = sec - minSec

        if (secDiff < 0.5) {  // else, first only weaken if the security of the host is not at its minimum
            // server is near min security
            var initialGrowRatio = maxMoney / money;
            var hackReGrowRatio = 1;
            var overallGrowRatio = 1;

            // hack if near max money (no substantial growth needed) 
            if (initialGrowRatio <= 1.1) {
                //if (initialGrowRatio != 1) {
                //    ns.print("WARN initial grow ratio: " + initialGrowRatio + " on target " + target);
                //}
                hackThreads = Math.floor(ns.hackAnalyzeThreads(target, hackMoneyRatio * money))
                // the grow ratio needed after the hack. Example: 50% of max money requires to grow by a factor of 2
                // also consinder initial missing money difference

                // expected grow ratio needed to re-grow the hacked money after hack
                hackReGrowRatio = 1 / (1 - hackMoneyRatio);

                addedHackSecurity = hackThreads * hackThreadSecurityIncrease;
            }

            //multiply the initial grow ratio by the expected new grow ratio needed after hack
            overallGrowRatio = initialGrowRatio * hackReGrowRatio;

            // considering 0 cores on all serers. 
            // The last parameter 0 can be removed if optimizing for running on home server with > 0 cores only
            growThreads = Math.ceil((ns.growthAnalyze(target, overallGrowRatio, 0)));

            addedGrowSecurity = growThreads * growThreadSecurityIncrease;
        }
        weakThreads = Math.ceil((secDiff + addedGrowSecurity + addedHackSecurity) * 20);

        var overallRamNeed = ((weakThreads + growThreads + hackThreads) * slaveScriptRam);

        //ns.tprint("partialWeakGrow: " + partialWeakGrow + " target: " + target);


        var weakTime = 0;
        var growTime = 0;
        var hackTime = 0;
        var parallelAttacks = 1;
        if (overallRamNeed > freeRams[1]) {
            // only attack if there is no other partial attack ongoing or if we want to hack.
            // this is to spend RAM on hacking, while not initially weakening and growing servers we would not hack yet anyways
            // early money is useful for server purchases to speed up RAM gain 
            // prevent partially weakening / growing multiple servers in parallel. Focus on few servers initially. 

            if (partialAttacks < 9) {
                //ns.print("incerase partial attacks " + partialAttacks)
                partialAttacks++;
            }

            const maxPercentage = freeRams[1] / overallRamNeed;
            if (partialWeakGrow == null || partialWeakGrow == target || hackThreads > 0) {
                if (hackThreads > 0) {
                    if (maxPercentage < 0.05) {
                        // too small attacks are not efficient, let's wait until we can at least perform 5 % of a full attack
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

                    hackThreads = Math.floor(ns.hackAnalyzeThreads(target, reducedHackMoneyRatio * money))

                    //ns.print("Reduced hack threads: " + hackThreads)
                    addedHackSecurity = hackThreads * hackThreadSecurityIncrease;
                    hackReGrowRatio = 1 / (1 - reducedHackMoneyRatio);
                    overallGrowRatio = initialGrowRatio * hackReGrowRatio;
                    growThreads = Math.floor((ns.growthAnalyze(target, overallGrowRatio, 0)));
                    addedGrowSecurity = growThreads * growThreadSecurityIncrease;

                    weakThreads = Math.floor((secDiff + addedGrowSecurity + addedHackSecurity) * 20);
                    if (hackThreads < 1 || weakThreads < 1) {
                        // we planned to hack but we have so small free RAM that it got divided and rounded down to zero 
                        // abort to not waste resources
                        return;
                    }

                    if (partialWeakGrow == target) {
                        // if we ran a partial weak/grow before and could do a full one now, reset partial attack
                        partialWeakGrow = null;
                    }
                    ns.print("INFO " + maxPercentage.toFixed(1) + " attack on " + target + " with " + weakThreads + " | " + growThreads + " | " + hackThreads);
                }
                else { //hackthreads == 0
                    growThreads = Math.floor(growThreads * maxPercentage);

                    addedGrowSecurity = growThreads * growThreadSecurityIncrease;
                    weakThreads = Math.floor((secDiff + addedGrowSecurity) * 20);
                    if (growThreads < 1 || weakThreads < 1) {
                        // got divided and rounded down to zero due to low RAM
                        break;
                    }
                    // we have only enough RAM to partially grow this target
                    partialWeakGrow = target;
                    ns.print("INFO " + maxPercentage.toFixed(1) + " weak/grow on " + target + " with " + weakThreads + " | " + growThreads + " | " + hackThreads);
                }
            }
            else {
                // no good partial attack strategy found for this target.
                //ns.print("INFO low RAM - no partial attack on " + target)
                continue;
            }

        }
        else if (hackThreads == 0) {
            // regular attack
            ns.print("INFO 1 weak/grow attack on " + target + " with " + weakThreads + " | " + growThreads + " | " + hackThreads);
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
            weakTime = ns.getWeakenTime(target);
            growTime = ns.getGrowTime(target);
            hackTime = ns.getHackTime(target);
            var maxAttacksDuringHack = Math.floor((hackTime - timeBetweenAttacks) / timeBetweenAttacks);
            var moreRamNeed = 0;

            for (parallelAttacks = 1; parallelAttacks < maxAttacksDuringHack; parallelAttacks++) {
                // check if we have enough RAM for one more attack
                moreRamNeed = ((weakThreads * (parallelAttacks + 1) + growThreads * (parallelAttacks + 1) +
                    hackThreads * (parallelAttacks + 1)) * slaveScriptRam);
                if (moreRamNeed >= freeRams[1]) {
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
                else if ((freeRams[1] / freeRams[2] < 0.1 || partialAttacks > 1) && (partialWeakGrow != null || freeRams < 512)) {
                    // if we are low on RAM, go for sincle attacks for better efficiency
                    break;
                }
                // increment parallel attacks via for loop
            }
            ns.print("INFO " + parallelAttacks + " attacks on " + target + " with " + weakThreads + " | " + growThreads + " | " + hackThreads);
        }

        // re-calculate overall RAM need after scaling full attacs down or up
        overallRamNeed = ((weakThreads + growThreads + hackThreads) * slaveScriptRam) * parallelAttacks;
        if (overallRamNeed > freeRams[1]) {
            // Typically, there should be enough RAM for the planned attack 
            ns.print("WARN RAM calculation issue for target: " + target + " need / free: " + overallRamNeed + " / " + freeRams[1]);
        }
        freeRams[1] -= overallRamNeed;

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

        for (var i = 0; i < parallelAttacks; i++) {
            if (weakThreads > 0) {
                if (!findPlaceToRun(ns, weakenScriptName, weakThreads, freeRams[0], target, weakSleep)) {
                    ns.print("WARN Did not find a place to run weaken " + target + " needs " + overallRamNeed)
                    return
                }
            }
            if (growThreads > 0) {
                if (!findPlaceToRun(ns, growScriptName, growThreads, freeRams[0], target, growSleep)) {
                    ns.print("WARN Did not find a place to run grow " + target + " needs " + overallRamNeed)
                    return;
                }
            }
            if (hackThreads > 0) {
                if (!findPlaceToRun(ns, hackScriptName, hackThreads, freeRams[0], target, hackSleep)) {
                    ns.print("WARN Did not find a place to run hack " + target + " needs " + overallRamNeed)
                    return;
                }
            }

            weakSleep += timeBetweenAttacks;
            growSleep += timeBetweenAttacks;
            hackSleep += timeBetweenAttacks;
        }
    }


}

function xpWeaken(ns, freeRams, servers, targets) {

    // let weken threads for XP farming sleep for this amount of ms
    //Needed to discriminate from regular weaken threads (with sleep 0)
    // other weaken threads should never sleep for 1 ms
    const xpWeakSleep = 1;

    // pick a server to target for XP weak
    // the last server from the list should have a high min security which is not a poor choice
    // TODO: target selection can be optimized

    const playerHackingLevel = ns.getHackingLevel();
    targets.sort((a, b) => weakenXPgainCompare(ns, playerHackingLevel, a) - weakenXPgainCompare(ns, playerHackingLevel, b))
    var weakTarget = targets[0];

    //   for (var target of targets.values()) {
    //       if (ns.getServerSecurityLevel(target) == ns.getServerMinSecurityLevel(target))
    //           weakTarget = target;
    //   }

    if (xpAttackOngoing(ns, servers, weakTarget, xpWeakSleep) == false) {
        // we have free RAM for this many weak threads
        var weakThreads = freeRams[1] / slaveScriptRam;
        // however, do not use all of it, only use a part of it to leave some buffer for the hack threads
        weakThreads = Math.floor(weakThreads * 0.8);
        if (weakThreads > 0) {
            ns.print("INFO XP weaken attack on " + weakTarget + " with " + weakThreads);
            if (!findPlaceToRun(ns, weakenScriptName, weakThreads, freeRams[0], weakTarget, xpWeakSleep)) {
                ns.print("WARN Did not find a place to run XP weaken " + weakTarget)
                return
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
function findPlaceToRun(ns, script, threads, freeRams, target, sleepTime) {
    var remaingThread = threads;
    while (true) {
        // if no more host with ram, return false
        if (freeRams.length === 0) {
            ns.print("WARN missing " + slaveScriptRam * remaingThread + " for " + script + " RAM for target " + target);
            return false;
        }

        // try with first availiable host
        var host = freeRams[0].host;
        var ram = freeRams[0].freeRam;

        // if not enough ram on host to even run 1 thread, remove the host from list
        if (ram < slaveScriptRam) {
            freeRams.shift();

            // else if the ram on the host is not enough to run all threads, just run as much as it can
        } else if (ram < slaveScriptRam * remaingThread) {
            const threadForThisHost = Math.floor(ram / slaveScriptRam);

            // try to run the script, at this point this will only fail if
            // the host is already running the script against the same target,
            // from an earlier cycle
            if (ns.exec(script, host, threadForThisHost, target, sleepTime) === 0) {
                // if failed, than find the next host to run it, and return its result
                return findPlaceToRun(ns, script, threads, freeRams.slice(1), target, sleepTime);
            } else {
                // if run successed update thread to run and remove this host from the list
                // if (script === "hack.js") {
                // ns.tprint(`executing ${script} on ${host} with ${threadForThisHost} threads, targeting ${target}`)
                // }
                remaingThread -= threadForThisHost;
                freeRams.shift();
            }
        } else {
            // try to run the script, at this point this will only fail if
            // the host is already running the script against the same target,
            // from an earlier cycle
            if (ns.exec(script, host, remaingThread, target, sleepTime) === 0) {
                // if failed, than find the next host to run it, and return its result
                if (!findPlaceToRun(ns, script, threads, freeRams.slice(1), target, sleepTime)) {
                    return false;
                }
            } else {
                // if run successed update the remaining ram for this host
                freeRams[0].freeRam -= slaveScriptRam * remaingThread;
            }

            return true;
        }
    }
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
        //let growScript = ns.getRunningScript(growScriptName, server, hackable);
        //let hackScript = ns.getRunningScript(hackScriptName, server, hackable);
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

    return [...servers.values()].filter(server => ns.getServerMaxMoney(server) > 100000
        && ns.getServerRequiredHackingLevel(server) <= ns.getHackingLevel()
        && ns.getServerMoneyAvailable(server) > 1
        && ns.getServerGrowth(server) > 1)
        .sort((a, b) => 5 * ns.getServerMinSecurityLevel(a) - 5 * ns.getServerMinSecurityLevel(b)
            + ns.getServerGrowth(b) - ns.getServerGrowth(a))
    // DODO:
    // the sort here ranks the hackable servers by "best server to hack"
    // Up to now this is just an educated guess and this can be optimized
    // minSec determines the execution times and growth the needed grow threads.
    // not sure how to value these in compareison plus whether and how to consider max available money on a hackable server 
}

// filter the list for servers where we can run script on
function getFreeRam(ns, servers) {
    const freeRams = [];
    var overallMaxRam = 0;
    var overallFreeRam = 0;
    for (let server of servers) {
        const maxRam = ns.getServerMaxRam(server);
        const usedRam = ns.getServerUsedRam(server)
        var freeRam = maxRam - usedRam;
        // round down to full hack slots
        freeRam = Math.floor(freeRam / slaveScriptRam) * slaveScriptRam
        overallMaxRam += maxRam;
        if (freeRam >= slaveScriptRam) {
            freeRams.push({ host: server, freeRam: freeRam });
            overallFreeRam += freeRam;
        }
    }
    var sortedFreeRams = freeRams.sort((a, b) => b.freeRam - a.freeRam);

    return [sortedFreeRams, overallFreeRam, overallMaxRam];
}

// scan all servers from home and nuke them if we can
async function scanAndHack(ns) {
    let servers = new Set(["home"]);
    scanAll(ns, "home", servers);
    var accessibleServers = new Set();
    for (let server of servers) {
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