/** @param {NS} ns **/
export async function main(ns) {
	ns.disableLog("disableLog"); ns.disableLog("sleep");
	ns.tail("crime.js");
	while (true) {
		ns.print("");
		var crimeTime = commitCrime(ns);
		await ns.sleep(crimeTime);
	}
}

function commitCrime(ns, combatStatsGoal = 75) {
	// Calculate the risk value of all crimes
	var player = ns.getPlayer();
	ns.print("Karma: " + ns.heart.break().toFixed(2));
	ns.print("Kills: " + player.numPeopleKilled);

	var bestCrime = "";
	var bestCrimeValue = 0;
	var bestCrimeStats = {};
	for (let crime of crimes) {
		let crimeChance = ns.getCrimeChance(crime);
		var crimeStats = ns.getCrimeStats(crime);
		if (crimeChance < 0.6 && bestCrimeValue > 0){
			continue;
		}
		if (crime == "Assassination" && player.numPeopleKilled < 30 && crimeChance > 0.98) {
			bestCrime = "Assassination";
			bestCrimeStats = crimeStats;
			break;
		}
		else if (crime == "Homicide" && player.numPeopleKilled < 30 && crimeChance > 0.98) {
			bestCrime = "Homicide";
			bestCrimeStats = crimeStats;
			break;
		}
		var crimeValue = 0;

		crimeValue = crimeStats.karma * 60000;
		crimeValue = crimeValue * crimeChance / ((crimeStats.time + 10));
		if (crimeValue > bestCrimeValue) {
			bestCrime = crime;
			bestCrimeValue = crimeValue;
			bestCrimeStats = crimeStats;
		}
	}

	ns.commitCrime(bestCrime);

	ns.print("Crime value " + ns.nFormat(bestCrimeValue, "0.0a") + " for " + bestCrime);
	return bestCrimeStats.time + 10;
}

var crimes = ["Shoplift", "RobStore", "Mug", "Larceny", "Deal Drugs", "Bond Forgery", "Traffick Arms", "Homicide",
	"Grand Theft Auto", "Kidnap", "Assassination", "Heist"];