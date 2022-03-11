/** @param {NS} ns **/
export async function main(ns) {
    // sets sleeves to do crimes
    let sleeveCrime = "Homicide"; // default crime if none specified via command line
    if (ns.args.length > 0){
        sleeveCrime = ns.args[0]; 
    }
    const numSleeves = ns.sleeve.getNumSleeves();
    let success = false;
    for (let i=0; i<numSleeves; i++){
        //ns.tprint(ns.sleeve.getInformation(i));
        success = ns.sleeve.setToCommitCrime(i, sleeveCrime);
    }
    if(success){
        ns.tprint("Set all sleeves to crime " + sleeveCrime);
    }
}