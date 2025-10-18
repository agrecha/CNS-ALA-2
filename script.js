/* Malware Behavior Simulator (safe, visual). No real networking or file access.
   Educational simulation only. */

(() => {
  // DOM elements
  const gridContainer = document.getElementById('gridContainer');
  const malwareTypeSel = document.getElementById('malwareType');
  const gridSizeSel = document.getElementById('gridSize');
  const speedRange = document.getElementById('speedRange');
  const speedVal = document.getElementById('speedVal');
  const resetBtn = document.getElementById('resetBtn');
  const seedBtn = document.getElementById('seedBtn');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const triggerTrojanBtn = document.getElementById('triggerTrojanBtn');
  const exportBtn = document.getElementById('exportBtn');

  const tickEl = document.getElementById('tick');
  const statClean = document.getElementById('stat-clean');
  const statInfected = document.getElementById('stat-infected');
  const statImmune = document.getElementById('stat-immune');
  const logArea = document.getElementById('logArea');

  let grid = [];
  let gridSize = parseInt(gridSizeSel.value, 10);
  let timer = null;
  let tick = 0;
  let stepDelay = parseInt(speedRange.value, 10);
  let running = false;
  let stats = {clean: 0, infected: 0, immune: 0};
  let summaryEvents = [];

  // Node states: clean, infected, immune, dormant (trojan waiting)
  function createGrid(n) {
    grid = [];
    gridContainer.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
    gridContainer.innerHTML = '';
    for (let i = 0; i < n * n; i++) {
      const node = {
        id: i,
        x: i % n,
        y: Math.floor(i / n),
        state: 'clean',
        // infection metadata used only in-sim
        infection: null, // {type, severity, age}
        element: null
      };
      const el = document.createElement('div');
      el.className = 'node clean';
      el.title = `Node ${i}\nstate: clean`;
      el.dataset.id = i;
      el.addEventListener('click', () => toggleSeed(i));
      el.addEventListener('mouseenter', () => showHover(node));
      node.element = el;
      grid.push(node);
      gridContainer.appendChild(el);
    }
    updateStats();
    log('Grid initialized (' + n + '×' + n + ').');
  }

  function showHover(node){
    node.element.title = `Node ${node.id}\nstate: ${node.state}${node.infection ? `\nmalware: ${node.infection.type}\nage:${node.infection.age}` : ''}`;
  }

  function toggleSeed(id){
    const node = grid[id];
    if(!node) return;
    if(node.state === 'clean'){
      // make it an initial infected/dormant seed depending on malware choice
      const type = malwareTypeSel.value;
      if(type === 'trojan'){
        node.state = 'dormant';
        node.infection = {type:'trojan', age:0, severity:0};
        node.element.className = 'node dormant';
        log(`Node ${node.id} seeded as DORMANT Trojan (hidden).`);
      } else {
        node.state = 'infected';
        node.infection = {type, age:0, severity:1};
        node.element.className = 'node infected';
        log(`Node ${node.id} seeded as INFECTED (${type}).`);
      }
    } else {
      // toggle back to clean
      node.state = 'clean';
      node.infection = null;
      node.element.className = 'node clean';
      log(`Node ${node.id} reset to CLEAN.`);
    }
    updateStats();
  }

  function neighbors(node){
    // 4 neighbors (N,E,S,W) inside grid bounds
    const n = gridSize;
    const list = [];
    const deltas = [[0,-1],[1,0],[0,1],[-1,0]];
    for(const [dx,dy] of deltas){
      const nx = node.x + dx, ny = node.y + dy;
      if(nx >=0 && nx < n && ny >=0 && ny < n){
        list.push(grid[ny * n + nx]);
      }
    }
    return list;
  }

  function tickStep(){
    tick++;
    tickEl.textContent = tick;
    const type = malwareTypeSel.value;

    // We'll collect changes first to avoid simultaneous updates interfering
    const changes = [];

    // iterate nodes
    for (const node of grid){
      if(node.state === 'infected' && node.infection){
        node.infection.age++;

        if(node.infection.type === 'virus'){
          // Virus: local degradation over time, may cause the host to become "immune" after
          node.infection.severity += 0.1; // simulated damage
          // small chance each tick to convert to immune (simulating detection/recovery)
          if(node.infection.age > 6 && Math.random() < 0.06){
            changes.push(()=>becomeImmune(node, 'virus'));
            summaryEvents.push({tick, event:'recovered', node:node.id, malware:'virus'});
          }
        } else if(node.infection.type === 'worm'){
          // Worm: tries to spread to neighbors each tick
          const nbrs = neighbors(node);
          for(const nb of nbrs){
            if(nb.state === 'clean' && Math.random() < 0.28){
              changes.push(()=>infectNode(nb, 'worm'));
              summaryEvents.push({tick, event:'spread', from:node.id, to:nb.id, malware:'worm'});
            }
          }
          // worm may also burn out / be detected
          if(node.infection.age > 10 && Math.random() < 0.04){
            changes.push(()=>becomeImmune(node, 'worm'));
            summaryEvents.push({tick, event:'recovered', node:node.id, malware:'worm'});
          }
        } else if(node.infection.type === 'trojan'){
          // Trojans are activated only when user triggers "Trigger Trojan" or a simulated trigger
          // If somehow active, treat like a virus (local damage)
          if(node.state === 'infected'){
            node.infection.severity += 0.08;
            if(node.infection.age > 8 && Math.random() < 0.05){
              changes.push(()=>becomeImmune(node, 'trojan'));
              summaryEvents.push({tick, event:'recovered', node:node.id, malware:'trojan'});
            }
          }
        }
      } else if(node.state === 'dormant'){
        // Dormant trojan waiting; small chance of auto-trigger to illustrate hidden behavior
        if(Math.random() < 0.005){
          changes.push(()=>activateTrojan(node));
          summaryEvents.push({tick, event:'autotrigger', node:node.id});
        }
      }
    }

    // Malware-type global behavior: worm modifies spread chance, virus affects only local, trojan needs explicit trigger
    // Execute collected changes
    for(const fn of changes) fn();

    updateStats();
    // stop automatically if no infected/dormant left
    if(!grid.some(n => n.state === 'infected' || n.state === 'dormant')){
      log('No active infections remain. Simulation paused.');
      stopSimulation();
    }
  }

  function infectNode(node, type){
    if(node.state !== 'clean') return;
    node.state = 'infected';
    node.infection = {type, age:0, severity:1};
    node.element.className = 'node infected';
    log(`Node ${node.id} infected by ${type}.`);
  }

  function becomeImmune(node, type){
    node.state = 'immune';
    node.infection = null;
    node.element.className = 'node immune';
    log(`Node ${node.id} recovered / marked immune (simulated).`);
  }

  function activateTrojan(node){
    if(node.state === 'dormant' && node.infection && node.infection.type === 'trojan'){
      node.state = 'infected';
      node.element.className = 'node infected';
      node.infection.age = 0;
      log(`Trojan at Node ${node.id} ACTIVATED (triggered).`);
      summaryEvents.push({tick, event:'activated', node:node.id});
      // Trojans on activation might try to spread slowly (simulate small worm-like behavior)
      // We'll attempt to infect a random neighbor immediately
      const nbrs = neighbors(node);
      if(nbrs.length && Math.random() < 0.3){
        const nb = nbrs[Math.floor(Math.random() * nbrs.length)];
        if(nb.state === 'clean'){
          infectNode(nb,'trojan');
          summaryEvents.push({tick, event:'spread', from:node.id, to:nb.id, malware:'trojan'});
        }
      }
    }
  }

  function startSimulation(){
    if(running) return;
    running = true;
    timer = setInterval(tickStep, stepDelay);
    log('Simulation started.');
  }

  function stopSimulation(){
    running = false;
    if(timer){
      clearInterval(timer);
      timer = null;
    }
  }

  function resetSimulation(){
    stopSimulation();
    tick = 0;
    summaryEvents = [];
    createGrid(gridSize);
  }

  function seedRandom(){
    // add a small number of seeds according to chosen malware type
    const type = malwareTypeSel.value;
    const seeds = Math.max(1, Math.floor(grid.length * 0.01 + Math.random() * 3));
    let placed = 0;
    for(let i=0; i<200 && placed < seeds; i++){
      const idx = Math.floor(Math.random() * grid.length);
      const node = grid[idx];
      if(node.state === 'clean'){
        if(type === 'trojan'){
          node.state = 'dormant';
          node.infection = {type:'trojan', age:0};
          node.element.className = 'node dormant';
          log(`Node ${node.id} seeded as DORMANT Trojan (random).`);
        } else {
          infectNode(node, type);
        }
        placed++;
      }
    }
    updateStats();
  }

  function updateStats(){
    stats.clean = grid.filter(n => n.state === 'clean').length;
    stats.infected = grid.filter(n => n.state === 'infected').length;
    stats.immune = grid.filter(n => n.state === 'immune').length;
    statClean.textContent = stats.clean;
    statInfected.textContent = stats.infected;
    statImmune.textContent = stats.immune;
  }

  function log(text){
    const time = new Date().toLocaleTimeString();
    logArea.textContent = `[${time}] ${text}\n` + logArea.textContent;
  }

  // Event listeners
  resetBtn.addEventListener('click', () => resetSimulation());
  seedBtn.addEventListener('click', () => seedRandom());
  startBtn.addEventListener('click', () => startSimulation());
  pauseBtn.addEventListener('click', () => { stopSimulation(); log('Simulation paused.'); });
  triggerTrojanBtn.addEventListener('click', () => {
    // trigger all dormant trojans
    const dormant = grid.filter(n => n.state === 'dormant');
    log(`Triggering ${dormant.length} dormant Trojan(s).`);
    for(const d of dormant) activateTrojan(d);
    updateStats();
  });

  malwareTypeSel.addEventListener('change', () => {
    // For clarity, when switching type we automatically reset seeds (safer)
    log('Malware type changed to ' + malwareTypeSel.value + '. You may want to reset or reseed.');
  });

  gridSizeSel.addEventListener('change', () => {
    gridSize = parseInt(gridSizeSel.value, 10);
    resetSimulation();
  });

  speedRange.addEventListener('input', () => {
    stepDelay = parseInt(speedRange.value, 10);
    speedVal.textContent = stepDelay + ' ms';
    if(running){
      stopSimulation();
      startSimulation();
    }
  });

  exportBtn.addEventListener('click', () => {
    // Create a simple, harmless report summarizing simulation events
    const report = {
      generatedAt: new Date().toISOString(),
      gridSize: `${gridSize}x${gridSize}`,
      malwareType: malwareTypeSel.value,
      ticks: tick,
      finalCounts: {clean: stats.clean, infected: stats.infected, immune: stats.immune},
      events: summaryEvents.slice(-200) // include last 200 events for brevity
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(report, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute('href', dataStr);
    dl.setAttribute('download', `sim-report-${Date.now()}.json`);
    document.body.appendChild(dl);
    dl.click();
    dl.remove();
    log('Report exported (JSON).');
  });

  // Helpers for initial rendering
  function init(){
    gridSize = parseInt(gridSizeSel.value, 10);
    stepDelay = parseInt(speedRange.value, 10);
    speedVal.textContent = stepDelay + ' ms';
    createGrid(gridSize);
    log('Simulator ready. Click nodes to seed, or use "Seed Random Infection".');
  }

  // Initialize UI on load
  init();

})();
