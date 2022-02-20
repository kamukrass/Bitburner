/** @param {NS} ns **/
export async function main(ns) {
	ns.disableLog("ALL");
	if (!ns.gang.inGang()) {
		joinGang(ns);
	}

	while (true) {
		recruit(ns);
		equipMembers(ns);
		ascend(ns);
		assignMembers(ns);
		territoryWar(ns);
		await ns.sleep(2000);
	}
}

function territoryWar(ns) {
	const minWinChanceToStartWar = 0.8;
	let gangInfo = ns.gang.getGangInformation();
	if (gangInfo.territory < 1) {
		let otherGangInfos = ns.gang.getOtherGangInformation();
		let myGangPower = gangInfo.power;
		//ns.print("My gang power: " + myGangPower);
		let lowestWinChance = 1;
		for (const otherGang of combatGangs.concat(hackingGangs)) {
			if (otherGang == gangInfo.faction) {
				continue;
			}
			else if (otherGangInfos[otherGang].territory <= 0) {
				continue;
			}
			else {
				let otherGangPower = otherGangInfos[otherGang].power;
				let winChance = myGangPower / (myGangPower + otherGangPower);
				lowestWinChance = Math.min(lowestWinChance, winChance);
			}
		}
		if (lowestWinChance > minWinChanceToStartWar) {
			if (!gangInfo.territoryWarfareEngaged) {
				ns.print("WARN start territory warfate");
				ns.toast("Start territory warfare");
				ns.gang.setTerritoryWarfare(true);
			}
			return;
		}
	}

	if (gangInfo.territoryWarfareEngaged) {
		ns.print("WARN stop territory warfate");
		ns.toast("Stop territory warfare");
		ns.gang.setTerritoryWarfare(false);
	}
}

function ascend(ns) {
	let members = ns.gang.getMemberNames();
	for (let member of members) {
		let memberInfo = ns.gang.getMemberInformation(member);
		let memberCombatStats = (memberInfo.str + memberInfo.def + memberInfo.dex + memberInfo.agi) / 4;
		//ns.print("Member combat stats: " + memberCombatStats);
		let memberAscensionMultiplier = (memberInfo.agi_asc_mult + memberInfo.def_asc_mult + memberInfo.dex_asc_mult + memberInfo.str_asc_mult) / 4;
		//ns.print("Member ascension multiplier: " + memberAscensionMultiplier);
		let memberAscensionResult = ns.gang.getAscensionResult(member);
		if (memberAscensionResult != undefined) {
			let memberAscensionResultMultiplier = (memberAscensionResult.agi + memberAscensionResult.def + memberAscensionResult.dex + memberAscensionResult.str) / 4;
			//ns.print("Member ascension result: " + memberNewAscensionMultiplier);
			if ((memberAscensionResultMultiplier > 1.3)) {
				ns.print("Ascent gang member " + member);
				ns.gang.ascendMember(member);
			}
		}
	}
}

function equipMembers(ns) {
	let members = ns.gang.getMemberNames();
	for (let member of members) {
		let memberInfo = ns.gang.getMemberInformation(member);
		if (memberInfo.augmentations.length < augmentationNames.length) {
			for (let augmentation of augmentationNames) {
				if (ns.gang.getEquipmentCost(augmentation) < (0.1 * ns.getServerMoneyAvailable("home"))) {
					ns.print("Purchase augmentation for " + member + ": " + augmentation);
					ns.gang.purchaseEquipment(member, augmentation);
				}
			}
		}
	}
}

function assignMembers(ns) {
	let members = ns.gang.getMemberNames();
	members.sort((a, b) => memberCombatStats(ns, b) - memberCombatStats(ns, a));
	let gangInfo = ns.gang.getGangInformation();
	let workJobs = Math.ceil((members.length - 1) / 2);
	let wantedLevelIncrease = 0;
	for (let member of members) {
		let highestTaskValue = 0;
		let highestValueTask = "Train Combat";
		let memberInfo = ns.gang.getMemberInformation(member);

		if (workJobs > 0 && gangInfo.territory < 1 && members.length >= 12) {
			workJobs--;
			highestValueTask = "Territory Warfare";
		}
		else if (workJobs > 0 && memberCombatStats(ns, member) > 50) {
			workJobs--;

			for (const task of tasks) {
				if (taskValue(ns, member, task) > highestTaskValue) {
					highestTaskValue = taskValue(ns, member, task)
					highestValueTask = task;
				}
			}
			wantedLevelIncrease += ns.formulas.gang.wantedLevelGain(gangInfo, ns.gang.getMemberInformation(member), ns.gang.getTaskStats(highestValueTask));
			//ns.print("Wanted Level for Increase: " + ns.formulas.gang.wantedLevelGain(gangInfo, ns.gang.getMemberInformation(member), ns.gang.getTaskStats(highestValueTask)))
		}
		else if (wantedLevelIncrease > 0) {
			highestValueTask = "Vigilante Justice";
			//ns.print("Wanted Level for Vigilante: " + ns.formulas.gang.wantedLevelGain(gangInfo, ns.gang.getMemberInformation(member), ns.gang.getTaskStats(highestValueTask)))
			wantedLevelIncrease += ns.formulas.gang.wantedLevelGain(gangInfo, ns.gang.getMemberInformation(member), ns.gang.getTaskStats(highestValueTask));
		}
		if (memberInfo.task != highestValueTask) {
			ns.print("Assign " + member + " to " + highestValueTask);
			ns.gang.setMemberTask(member, highestValueTask);
		}
	}
}

function taskValue(ns, member, task) {
	let respectGain = ns.formulas.gang.respectGain(ns.gang.getGangInformation(), ns.gang.getMemberInformation(member), ns.gang.getTaskStats(task));
	let moneyGain = ns.formulas.gang.moneyGain(ns.gang.getGangInformation(), ns.gang.getMemberInformation(member), ns.gang.getTaskStats(task));
	moneyGain /= 1000;
	moneyGain = Math.max(moneyGain, respectGain);
	return respectGain * moneyGain;
}

function memberCombatStats(ns, member) {
	let memberInfo = ns.gang.getMemberInformation(member);
	return (memberInfo.str + memberInfo.def + memberInfo.dex + memberInfo.agi) / 4;
}


function recruit(ns) {
	if (ns.gang.canRecruitMember()) {
		let members = ns.gang.getMemberNames();
		let memberName = "Thug-" + members.length;
		ns.print("Recruit new gang member " + memberName);
		ns.gang.recruitMember(memberName);
	}
}

function joinGang(ns) {
	for (const myGang of combatGangs) {
		if (ns.gang.createGang(myGang)) {
			return;
		}
	}
}

const tasks = ["Mug People", "Deal Drugs", "Strongarm Civilians", "Run a Con", "Armed Robbery", "Traffick Illegal Arms", "Threaten & Blackmail", "Human Trafficking", "Terrorism"];

const augmentationNames = ["Bionic Arms", "Bionic Legs", "Bionic Spine", "BrachiBlades", "Nanofiber Weave", "Synthetic Heart", "Synfibril Muscle", "Graphene Bone Lacings", "BitWire", "Neuralstimulator", "DataJack"];

const combatGangs = ["Speakers for the Dead", "The Dark Army", "The Syndicate", "Tetrads", "Slum Snakes"]

const hackingGangs = ["NiteSec", "The Black Hand"];