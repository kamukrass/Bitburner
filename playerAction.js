
const studyUntilHackLevel = 10;

/** @param {NS} ns **/
export async function main(ns) {
	ns.disableLog("ALL");

	while (true) {
		ns.print("");
		var sleepTime = 5000;
		var player = ns.getPlayer();

		getPrograms(ns, player);

		joinFactions(ns);

		var factionsForReputation = getFactionsForReputation(ns, player);
		ns.print("Factions for Reputation: " + [...factionsForReputation.keys()]);

		var actionUseful = currentActionUseful(ns, player, factionsForReputation);
		ns.print("Current action useful: " + actionUseful);

		if (!actionUseful) {
			sleepTime = chooseAction(ns, sleepTime, player, factionsForReputation);
		}

		ns.print("WorkFactionName: " + player.currentWorkFactionName)
		ns.print("WorkFactionDescription: " + player.currentWorkFactionDescription)
		ns.print("workType: " + player.workType)
		ns.print("companyName: " + player.companyName)
		ns.print("jobs: " + JSON.stringify(player.jobs))
		//ns.print("Corps to work for: " + getCorpsForReputation(factionsForReputation))

		await ns.sleep(sleepTime);
	}
}

function getPrograms(ns, player) {
	if (!player.tor) {
		if (player.money > 1700000) {
			ns.purchaseTor();
			ns.print("Purchased TOR");
			ns.toast("Purchased TOR");
		}
		else {
			return;
		}
	}
	ns.purchaseProgram("BruteSSH.exe");
	ns.purchaseProgram("FTPCrack.exe");
	ns.purchaseProgram("relaySMTP.exe");
	if (player.has4SDataTixApi) {
		// do not buy more before 4s data access bought
		ns.purchaseProgram("HTTPWorm.exe");
		ns.purchaseProgram("SQLInject.exe");
	}
}

function chooseAction(ns, sleepTime, player, factions) {
	const focus = ns.isFocused();

	const crimeUntilMoney = 1000000000;
	if (ns.getHackingLevel() < studyUntilHackLevel) {
		ns.universityCourse("rothman university", "Study Computer Science", true);
	}
	else if (factions.size > 0) {
		const wType = "Hacking Contracts";
		var faction = factions.keys().next().value
		const success = ns.workForFaction(faction, wType, focus);
		if (success) {
			ns.print("Start working for faction " + faction);
			ns.toast("Start working for faction " + faction, "success", 5000);
		}
		else {
			ns.print("Could not perform intended action: " + faction + " -> " + wType);
		}
	}
	else if (player.getHackingLevel >= 250) {
		var corpsToWorkFor = getCorpsForReputation(ns, factions);
		//ns.print(corpsToWorkFor);
		if (corpsToWorkFor.length > 0) {
			if (player.jobs[corpsToWorkFor[0]] == null) {
				const wType = "IT Intern";
				ns.applyToCompany(corpsToWorkFor[0], wType);
				ns.print("Applied for " + wType);
				ns.toast("Applied for " + wType);
				ns.workForCompany(corpsToWorkFor[0], focus);
			}
			else if (player.jobs[corpsToWorkFor[0]] == "IT Intern") {
				const wType = "IT Analyst";
				ns.applyToCompany(corpsToWorkFor[0], wType);
				ns.print("Applied for " + wType);
				ns.toast("Applied for " + wType);
				ns.workForCompany(corpsToWorkFor[0], focus);
			}
			else if (player.jobs[corpsToWorkFor[0]] == "IT Analyst") {
				const wType = "IT Manager";
				ns.applyToCompany(corpsToWorkFor[0], wType);
				ns.print("Applied for " + wType);
				ns.toast("Applied for " + wType);
				ns.workForCompany(corpsToWorkFor[0], focus);
			}
			else if (player.jobs[corpsToWorkFor[0]] == "IT Manager") {
				const wType = "Systems Administrator";
				ns.applyToCompany(corpsToWorkFor[0], wType);
				ns.print("Applied for " + wType);
				ns.toast("Applied for " + wType);
				ns.workForCompany(corpsToWorkFor[0], focus);
			}
			//ns.print(corpsToWorkFor[0]);
			if (player.workType != "Working for Company") {
				ns.workForCompany(corpsToWorkFor[0], focus);
				ns.print("Start working for " + corpsToWorkFor[0]);
				ns.toast("Start working for " + corpsToWorkFor[0]);
			}
		}
	}
	else if (focus) {
		const crimeTime = commitCrime(ns, player);
		return crimeTime;
	}
	return sleepTime;
}

function currentActionUseful(ns, player, factions) {
	var playerControlPort = ns.getPortHandle(3); // port 2 is hack
	if (player.workType == "Working for Faction") {
		if (factions.has(player.currentWorkFactionName)) {
			var repRemaining = factions.get(player.currentWorkFactionName) - player.workRepGained;
			if (repRemaining > 0) {
				// working for a faction needing more reputation for augmentations
				if (playerControlPort.empty()) {
					// only write to ports if empty
					playerControlPort.write(true);

				}
				// seems a cycle is .2 ms, so RepGainRate * 5 is gain per second
				var reputationTimeRemaining = repRemaining / (player.workRepGainRate * 5);
				ns.print("Reputation remaining: " + ns.nFormat(repRemaining, "0a") + " in " + ns.nFormat(reputationTimeRemaining / 60, "0a") + " min");
				return true;
			}
			else {
				ns.print("Max Reputation @ " + player.currentWorkFactionName);
				ns.toast("Max Reputation @ " + player.currentWorkFactionName, "success", 5000);
				return false;
			}
		}
		else {
			return false;
		}
	}
	else { // not hacking for a faction
		if (playerControlPort.empty()) {
			// only write to ports if empty
			playerControlPort.write(false);
		}
	}
	if (player.workType == "Studying or Taking a class at university") {
		if (player.getHackingLevel < studyUntilHackLevel) {
			return true;
		}
	}
	return false;
}

function getFactionsForReputation(ns, player) {

	var factionsWithAugmentations = new Map();
	for (const faction of player.factions) {
		var maxReputationRequired = hasNewAugments(ns, faction);
		if (ns.getFactionRep(faction) < maxReputationRequired) {
			factionsWithAugmentations.set(faction, maxReputationRequired - ns.getFactionRep(faction));
		}
	}
	return factionsWithAugmentations;
}

function getCorpsForReputation(ns, factions) {
	var corpsWithoutFaction = []
	for (const corp of megaCorps) {
		if (!factions.has(corp) && hasNewAugments(ns, corp) > 0) {
			corpsWithoutFaction.push(corp);
		}
	}
	return corpsWithoutFaction;
}

function hasNewAugments(ns, faction) {
	var purchasedAugmentations = ns.getOwnedAugmentations(true);
	var augmentations = ns.getAugmentationsFromFaction(faction);
	var newAugmentations = augmentations.filter(val => !purchasedAugmentations.includes(val));

	if (newAugmentations.length > 0) {
		// go for the last augmentation in the list. Assumption: Higher rep augs from follow-up factions
		var maxReputationRequired = 0;
		for (const augmentation of newAugmentations) {
			if (ignoreFactionAugs.has(faction)) {
				if (ignoreFactionAugs.get(faction) == augmentation) {
					// ignore some augmentations which we want to buy from later factions
					continue;
				}
			}
			maxReputationRequired = Math.max(maxReputationRequired, ns.getAugmentationRepReq(augmentation));
		}
		return maxReputationRequired;
		// go for the last augmentation in the list. Assumption: Higher rep augs from follow-up factions
		// some augs will be completely ignored however
		//return ns.getAugmentationRepReq(newAugmentations[newAugmentations.length - 1]);
	}
	return 0;
}

function joinFactions(ns) {
	const newFactions = ns.checkFactionInvitations();
	for (const faction of newFactions) {
		if (!cityFactions.includes(faction) && hasNewAugments(ns, faction)) {
			ns.joinFaction(faction);
			ns.print("Joined " + faction);
		}
	}
}

function commitCrime(ns, player, combatStatsGoal = 75) {
	// Calculate the risk value of all crimes
	var bestCrime = "";
	var bestCrimeValue = 0;
	var crimeStats = {};
	for (let crime of crimes) {
		let crimeChance = ns.getCrimeChance(crime);
		crimeStats = ns.getCrimeStats(crime);
		if (crime == "Assassination" && player.numPeopleKilled < 30 && crimeChance > 0.99) {
			bestCrime = "Assassination";
			break;
		}
		else if (crime == "Homicide" && player.numPeopleKilled < 30 && crimeChance > 0.99) {
			bestCrime = "Homicide";
			break;
		}
		var crimeValue = 0;
		if (player.strength < combatStatsGoal) {
			crimeValue += 10 * crimeStats.strength_exp;
		}
		if (player.defense < combatStatsGoal) {
			crimeValue += 10 * crimeStats.defense_exp;
		}
		if (player.dexterity < combatStatsGoal) {
			crimeValue += 10 * crimeStats.dexterity_exp;
		}
		if (player.agility < combatStatsGoal) {
			crimeValue += 10 * crimeStats.agility_exp;
		}
		crimeValue += crimeStats.money;

		crimeValue = crimeValue * crimeChance / crimeStats.time;
		if (crimeValue > bestCrimeValue) {
			bestCrime = crime;
			bestCrimeValue = crimeValue;
		}
		//ns.print(JSON.stringify(crimeStats));
	}

	ns.commitCrime(bestCrime);

	ns.print("Crime value " + ns.nFormat(bestCrimeValue, "0a") + " (xp + $) / s");
	return crimeStats.time;
}

var megaCorps = ["Clarke Incorporated", "OmniTek Incorporated", "NWO", "Fulcrum Technologies",
	"ECorp", "MegaCorp", "KuaiGong International", "Four Sigma", "Blade Industries", "Bachman & Associates"];

var cityFactions = ["Sector-12", "Chongqing", "New Tokyo", "Ishima", "Aevum", "Volhaven"];

var crimes = ["Shoplift", "RobStore", "Mug", "Larceny", "Deal Drugs", "Bond Forgery", "Traffick Arms", "Homicide",
	"Grand Theft Auto", "Kidnap", "Assassination", "Heist"];

const ignoreFactionAugs = new Map([
	["CyberSec", 'Cranial Signal Processors - Gen II'],
	["NiteSec", 'DataJack'],
	["Sector-12", 'Neuralstimulator'],
])

/*
createProgram()
BruteSSH.exe: 50
FTPCrack.exe: 100
relaySMTP.exe: 250
HTTPWorm.exe: 500
SQLInject.exe: 750
DeepscanV1.exe: 75
DeepscanV2.exe: 400
ServerProfiler.exe: 75
AutoLink.exe: 25

work faction: 266.667 rep required if hacked ++ except fulcrum + 66.666 k
*/