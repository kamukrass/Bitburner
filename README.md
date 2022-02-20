Set of scripts for playing the Bitburner game.

A list of files and what they do:

- distributed-hack: Main controller script for anything related to hacking. Requires the weaken, hack, grow and share files to be present. 
    - Just run - fully automated. Adapts to any situation automatically.
    - Solves coding contracts
    - Backdoors faction servers (you have to activate that manually via parameters at the top if you have SF4.1 singularity)
    - Manipulates stock market via port for stock trader scripts (requires stock market trading scripts with compatible ports, see below)
    - Uses ns.share if triggered via port by playerActions script

- upgrade-servers: Buys and upgrades servers in meaningful increments. Just run - fully automated. 

- early-stock-trader for before 4s and stock-trader for after 4s
    - If you can short stocks (see BitNode 8), modify the parameters at the top. 
    - uses money to trade stock for profit
    - have ports to the distributed-hack script

- solve-contracts: Script to solve coding contracts.

- playerActions: Automates Singularity Functions - join factions, work for companies and factions, upgrade home computer, ...

- corp: Runs a corporation

- weaken, hack, grow, share: They will be copied and run across servers automatically.

If you want to know what's going on, read the logfiles.
If you are interested in details, enable commented print commands in the files (for example to see ram usage)
