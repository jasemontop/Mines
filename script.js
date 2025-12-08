const BAL_KEY = "mines_balance_v10";
const DAILY_KEY = "mines_lastDaily_v10";
const USERS_KEY = "mines_users_v1";
const CURR_USER_KEY = "mines_currentUser_v1";

const balanceEl = document.getElementById("balance");
const balanceChangeEl = document.createElement("div");
const percentageEl = document.getElementById("percentage");
const gridEl = document.getElementById("grid");
const minesInput = document.getElementById("minesInput");
const betInput = document.getElementById("betInput");
const cashoutBtn = document.getElementById("cashoutBtn");
const dailyBtn = document.getElementById("dailyBtn");
// Note: old footer Restart button was removed — modal provides Restart now
const flashOverlay = document.getElementById("flashOverlay");
const floatingText = document.getElementById("floatingText");
const notificationContainer = document.getElementById("notificationContainer");

// Notification system
const NOTIF_KEY = "mines_notifications_v1";

function addNotificationForUser(username, message, type = 'info'){
  try{
    const notifs = JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}');
    if(!notifs[username]) notifs[username] = [];
    notifs[username].unshift({ message, type, timestamp: Date.now(), unread: true });
    // keep last 50 notifications per user
    notifs[username] = notifs[username].slice(0, 50);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs));
  }catch(e){}
}

function showNotification(message, type = 'info'){
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.textContent = message;
  notificationContainer.appendChild(notif);
  
  // Remove after animation completes (5 seconds total)
  setTimeout(()=> notif.remove(), 5000);
}

function checkAndShowNotifications(){
  if(!currentUser) return;
  try{
    const notifs = JSON.parse(localStorage.getItem(NOTIF_KEY) || '{}');
    if(notifs[currentUser]){
      const unread = notifs[currentUser].filter(n => n.unread);
      unread.forEach(n => {
        showNotification(n.message, n.type);
        n.unread = false; // mark as read
      });
      if(unread.length > 0){
        localStorage.setItem(NOTIF_KEY, JSON.stringify(notifs));
      }
    }
  }catch(e){}
}

// Check for ban status
function isUserBanned(username){
  const users = loadUsers();
  if(!users[username]) return false;
  const banUntil = users[username].banUntil;
  if(!banUntil) return false;
  return Date.now() < banUntil;
}

function getBanTimeRemaining(username){
  const users = loadUsers();
  if(!users[username]) return 0;
  const banUntil = users[username].banUntil;
  if(!banUntil) return 0;
  const remaining = banUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 60000) : 0; // minutes
}

function checkForceLogout(){
  if(!currentUser) return;
  const users = loadUsers();
  if(!users[currentUser]) return;
  const forceLogout = users[currentUser].forceLogout;
  if(forceLogout && forceLogout > (Date.now() - 60000)){ // within last minute
    // User was force logged out
    showNotification('You have been logged out by an administrator', 'warning');
    setTimeout(()=>{
      currentUser = null;
      localStorage.removeItem(CURR_USER_KEY);
      renderUserBadge();
      showAuthModal(true, 'login');
    }, 1000);
  }
}

// Lost modal (created once) — use CSS classes for styling/animation
const lostModal = document.createElement("div");
const lostBox = document.createElement("div");
const lostMsg = document.createElement("div");
const lostRestartBtn = document.createElement("button");

lostModal.id = "lostModal";
lostModal.className = 'lost-modal';
lostBox.className = 'lost-box';
lostMsg.className = 'lost-msg';
lostRestartBtn.className = 'lost-restart-btn';

lostMsg.textContent = 'Round lost';
lostRestartBtn.textContent = 'Restart';

lostRestartBtn.onclick = ()=>{
  lostModal.classList.remove('visible');
  generateGrid();
};

lostBox.appendChild(lostMsg);
lostBox.appendChild(lostRestartBtn);
lostModal.appendChild(lostBox);
document.body.appendChild(lostModal);

// --- Authentication UI elements ---
const authModal = document.getElementById('authModal');
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const authSubmit = document.getElementById('authSubmit');
const authLoginBtn = document.getElementById('authLoginBtn');
const authSignupBtn = document.getElementById('authSignupBtn');
const authError = document.getElementById('authError');
const authTitle = document.getElementById('authTitle');
const userBadge = document.getElementById('userBadge');

let currentUser = localStorage.getItem(CURR_USER_KEY) || null;

function loadUsers(){
  try{ return JSON.parse(localStorage.getItem(USERS_KEY) || '{}'); }catch(e){ return {}; }
}
function saveUsers(u){ localStorage.setItem(USERS_KEY, JSON.stringify(u)); }

async function hashPassword(pw){
  const enc = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b=>b.toString(16).padStart(2,'0')).join('');
}

function showAuthModal(show, mode='login'){
  if(show){
    authModal.classList.add('visible');
    authModal.setAttribute('aria-hidden','false');
    if(mode==='signup'){ authSignupBtn.classList.add('active'); authLoginBtn.classList.remove('active'); authTitle.textContent='Create account'; }
    else { authLoginBtn.classList.add('active'); authSignupBtn.classList.remove('active'); authTitle.textContent='Welcome'; }
    authUsername.focus();
  }else{
    authModal.classList.remove('visible');
    authModal.setAttribute('aria-hidden','true');
  }
}

function showAuthError(msg){ authError.textContent = msg || ''; }

// sanitize username: remove angle-brackets (prevent HTML injection) and
// strip emoji/surrogate-pair characters so users cannot include emoji in names.
function sanitizeUsername(name){
  if(!name) return '';
  // remove HTML angle brackets
  let out = name.replace(/[<>]/g,'').trim();
  // remove common emoji ranges/surrogate pairs and variation selectors
  out = out.replace(/\uFE0F/g, '');
  out = out.replace(/[\u2600-\u26FF\u2700-\u27BF]/g, '');
  out = out.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
  return out;
}

function renderUserBadge(){
  if(currentUser){
    // build badge safely using textContent to avoid any HTML injection
    userBadge.innerHTML = '';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'user-name';
    nameSpan.textContent = currentUser;
    userBadge.appendChild(nameSpan);
    // owner crown for the site owner 'jasem'
    if(currentUser === 'jasem'){
      const crown = document.createElement('span');
      crown.textContent = ' 👑';
      crown.setAttribute('aria-hidden','true');
      nameSpan.appendChild(crown);
    }
    const statsBtn = document.createElement('button');
    statsBtn.className = 'btn outline';
    statsBtn.id = 'statsBtn';
    statsBtn.textContent = 'Stats';
    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'logout';
    logoutBtn.id = 'logoutBtn';
    logoutBtn.textContent = 'Logout';
    userBadge.appendChild(statsBtn);
    userBadge.appendChild(logoutBtn);
    // admin button for owner
    if(currentUser === 'jasem'){
      const adminBtn = document.createElement('button');
      adminBtn.className = 'btn outline'; adminBtn.id = 'adminBtn'; adminBtn.textContent = 'Admin';
      adminBtn.onclick = ()=> showAdminModal(true);
      userBadge.appendChild(adminBtn);
    }
    userBadge.style.display = 'flex';
    logoutBtn.onclick = ()=>{
      currentUser = null;
      localStorage.removeItem(CURR_USER_KEY);
      userBadge.style.display = 'none';
      showAuthModal(true,'login');
    };
    statsBtn.onclick = ()=>{ showAnalyticsModal(true); };
  } else {
    userBadge.style.display = 'none';
  }
}

// wire auth tab buttons
authLoginBtn.onclick = ()=>{ showAuthModal(true,'login'); showAuthError(); };
authSignupBtn.onclick = ()=>{ showAuthModal(true,'signup'); showAuthError(); };

// Submit handler - decides login or signup based on active tab
authSubmit.onclick = async ()=>{
  let username = authUsername.value && authUsername.value.trim();
  username = sanitizeUsername(username);
  const password = authPassword.value || '';
  if(!username) return showAuthError('Choose a username');
  if(password.length < 1) return showAuthError('Enter a password');

  const users = loadUsers();
  const isSignup = authSignupBtn.classList.contains('active');
  if(isSignup){
    // signup: username must be unique
    if(users[username]) return showAuthError('Username already taken');
    const h = await hashPassword(password);
    // create account with initial balance and empty stats
    users[username] = { pw: h, created: Date.now(), balance: 1000, stats: { wins:0, losses:0, totalLost:0, boardsCleared:0, totalProfit:0 } };
    saveUsers(users);
    currentUser = username; localStorage.setItem(CURR_USER_KEY, currentUser);
    // load account balance into the UI
    balance = users[username].balance || 1000;
    saveBalance();
    showAuthError(''); showAuthModal(false);
    renderUserBadge();
  } else {
    // login
    if(!users[username]) return showAuthError('User not found');
    const h = await hashPassword(password);
    if(users[username].pw !== h) return showAuthError('Incorrect password');
    
    // Check if user is banned
    if(isUserBanned(username)){
      const mins = getBanTimeRemaining(username);
      return showAuthError(`Account is banned. ${mins} minute(s) remaining.`);
    }
    
    currentUser = username; localStorage.setItem(CURR_USER_KEY, currentUser);
    // load account balance and stats
    balance = users[username].balance || 1000;
    saveBalance();
    showAuthError(''); showAuthModal(false);
    renderUserBadge();
    // Check for notifications
    checkAndShowNotifications();
  }
};

// on load, if no user logged in, force auth modal
if(!currentUser){
  // small timeout so UI finishes loading
  setTimeout(()=> showAuthModal(true,'login'), 80);
} else {
  renderUserBadge();
  // Check if user is banned
  if(isUserBanned(currentUser)){
    const mins = getBanTimeRemaining(currentUser);
    showNotification(`Your account is banned. ${mins} minute(s) remaining.`, 'warning');
    setTimeout(()=>{
      currentUser = null;
      localStorage.removeItem(CURR_USER_KEY);
      renderUserBadge();
      showAuthModal(true, 'login');
    }, 2000);
  } else {
    // Check for force logout
    checkForceLogout();
    // Check for notifications
    checkAndShowNotifications();
  }
}

// Periodically check for bans and force logout (every 10 seconds)
setInterval(()=>{
  if(currentUser){
    if(isUserBanned(currentUser)){
      const mins = getBanTimeRemaining(currentUser);
      showNotification(`Your account has been banned. ${mins} minute(s) remaining.`, 'warning');
      currentUser = null;
      localStorage.removeItem(CURR_USER_KEY);
      renderUserBadge();
      showAuthModal(true, 'login');
    } else {
      checkForceLogout();
    }
  }
}, 10000);

// --- Analytics modal elements ---
  const analyticsModal = document.getElementById('analyticsModal');
const statUsername = document.getElementById('statUsername');
const statWins = document.getElementById('statWins');
const statLosses = document.getElementById('statLosses');
const statBoardsCleared = document.getElementById('statBoardsCleared');
const statTotalProfit = document.getElementById('statTotalProfit');
const statTotalLost = document.getElementById('statTotalLost');
const closeAnalytics = document.getElementById('closeAnalytics');

function showAnalyticsModal(show){
  if(!currentUser) return; // only visible when logged in
  const users = loadUsers();
  const u = users[currentUser] || { stats: {} };
  if(show){
    statUsername.textContent = currentUser;
    statWins.textContent = (u.stats && u.stats.wins) || 0;
    statLosses.textContent = (u.stats && u.stats.losses) || 0;
    statBoardsCleared.textContent = (u.stats && u.stats.boardsCleared) || 0;
    const profit = (u.stats && typeof u.stats.totalProfit !== 'undefined') ? u.stats.totalProfit : 0;
    statTotalProfit.textContent = (profit >= 0 ? '+'+profit : profit);
    statTotalLost.textContent = (u.stats && u.stats.totalLost) || 0;
    analyticsModal.classList.add('visible');
  } else {
    analyticsModal.classList.remove('visible');
  }
}

closeAnalytics.onclick = ()=> showAnalyticsModal(false);

// --- Admin modal elements (owner only) ---
const adminModal = document.getElementById('adminModal');
const adminUserSelect = document.getElementById('adminUserSelect');
const adminBalanceInput = document.getElementById('adminBalanceInput');
const adminSetBalance = document.getElementById('adminSetBalance');
const adminBanMinutes = document.getElementById('adminBanMinutes');
const adminBanBtn = document.getElementById('adminBanBtn');
const adminUnbanBtn = document.getElementById('adminUnbanBtn');
const adminResetPwd = document.getElementById('adminResetPwd');
const adminResetBtn = document.getElementById('adminResetBtn');
const adminForceLogoutBtn = document.getElementById('adminForceLogoutBtn');
const adminAuditLog = document.getElementById('adminAuditLog');
const closeAdmin = document.getElementById('closeAdmin');

function appendAudit(entry){
  try{
    const key = 'mines_admin_log_v1';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    list.unshift(entry);
    localStorage.setItem(key, JSON.stringify(list.slice(0,200)));
  }catch(e){}
}

function loadAuditToUI(){
  try{
    const key = 'mines_admin_log_v1';
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    adminAuditLog.innerHTML = '';
    list.slice(0,100).forEach(l=>{
      const d = document.createElement('div');
      const t = new Date(l.at).toLocaleString();
      d.textContent = `[${t}] ${l.by}: ${l.action}`;
      adminAuditLog.appendChild(d);
    });
  }catch(e){ adminAuditLog.textContent = 'no logs'; }
}

function showAdminModal(show){
  if(!show){ adminModal.classList.remove('visible'); return; }
  if(currentUser !== 'jasem') return; // only owner
  // populate users
  adminUserSelect.innerHTML = '';
  const users = loadUsers();
  Object.keys(users).forEach(u=>{
    const opt = document.createElement('option'); opt.value = u; opt.textContent = u; adminUserSelect.appendChild(opt);
  });
  if(adminUserSelect.options.length>0) adminUserSelect.selectedIndex = 0;
  // load selected
  const sel = adminUserSelect.value;
  if(sel){
    const users = loadUsers();
    adminBalanceInput.value = (users[sel] && users[sel].balance) || 0;
  }
  loadAuditToUI();
  adminModal.classList.add('visible');
}

adminUserSelect.onchange = ()=>{
  const sel = adminUserSelect.value; const users = loadUsers();
  adminBalanceInput.value = (users[sel] && users[sel].balance) || 0;
};

adminSetBalance.onclick = ()=>{
  const sel = adminUserSelect.value; const v = parseInt(adminBalanceInput.value) || 0;
  const users = loadUsers(); users[sel] = users[sel] || {};
  const oldBalance = users[sel].balance || 0;
  users[sel].balance = v; saveUsers(users);
  appendAudit({by: currentUser, at: Date.now(), action: `set balance ${sel} -> ${v}`} );
  
  // Send notification to user
  addNotificationForUser(sel, `Admin ${currentUser} has set your balance to ${v} 💰 (was ${oldBalance})`, 'info');
  
  // If it's the current user, update their live balance immediately
  if(sel === currentUser) { balance = v; saveBalance(); }
  
  showFloatingText(`Set ${sel} = ${v}`,'rgba(46,204,113,0.9)');
};

adminBanBtn.onclick = ()=>{
  const sel = adminUserSelect.value; const mins = Math.max(1, parseInt(adminBanMinutes.value)||0);
  const users = loadUsers(); users[sel] = users[sel] || {}; users[sel].banUntil = Date.now() + mins*60000; saveUsers(users);
  appendAudit({by: currentUser, at: Date.now(), action: `banned ${sel} for ${mins}m`});
  
  // Send notification to user
  addNotificationForUser(sel, `You have been banned by admin ${currentUser} for ${mins} minute(s). 🚫`, 'warning');
  
  showFloatingText(`Banned ${sel} ${mins}m`,'rgba(255,92,96,0.9)');
};

adminUnbanBtn.onclick = ()=>{
  const sel = adminUserSelect.value; const users = loadUsers(); users[sel] = users[sel] || {}; delete users[sel].banUntil; saveUsers(users);
  appendAudit({by: currentUser, at: Date.now(), action: `unbanned ${sel}`});
  
  // Send notification to user
  addNotificationForUser(sel, `You have been unbanned by admin ${currentUser}. Welcome back! ✅`, 'success');
  
  showFloatingText(`Unbanned ${sel}`,'rgba(46,204,113,0.9)');
};

adminResetBtn.onclick = async ()=>{
  const sel = adminUserSelect.value; const pwd = adminResetPwd.value || '';
  if(!pwd){ showFloatingText('Enter temp password','red'); return; }
  const users = loadUsers(); users[sel] = users[sel] || {};
  const h = await hashPassword(pwd);
  users[sel].pw = h; saveUsers(users);
  appendAudit({by: currentUser, at: Date.now(), action: `reset password for ${sel}`});
  
  // Send notification to user
  addNotificationForUser(sel, `Admin ${currentUser} has reset your password. Your new temporary password is: ${pwd}`, 'warning');
  
  showFloatingText(`Reset pwd for ${sel}`,'rgba(46,204,113,0.9)');
};

adminForceLogoutBtn.onclick = ()=>{
  const sel = adminUserSelect.value; const users = loadUsers(); users[sel] = users[sel] || {};
  users[sel].forceLogout = Date.now(); saveUsers(users);
  appendAudit({by: currentUser, at: Date.now(), action: `force logout ${sel}`});
  
  // Send notification to user
  addNotificationForUser(sel, `You have been logged out by admin ${currentUser}. 🚪`, 'warning');
  
  showFloatingText(`Force logout ${sel}`,'rgba(46,204,113,0.9)');
  // if it's current user locally, log out immediately
  if(sel === currentUser){ currentUser = null; localStorage.removeItem(CURR_USER_KEY); renderUserBadge(); showAuthModal(true,'login'); }
};

closeAdmin.onclick = ()=> showAdminModal(false);

const maxBtn = document.getElementById("maxBtn");
const halfBtn = document.getElementById("halfBtn");
const randBtn = document.getElementById("randBtn");

const GRID_SIZE = 25;
// multiplier speed: >1 makes the displayed multiplier grow faster; tweak to taste
const MULTIPLIER_SPEED = 1.6;

// Initialize balance: prefer per-user stored balance when logged in, fall back to legacy key
let balance = 1000;
try{
  if(currentUser){
    const users = loadUsers();
    balance = parseInt((users[currentUser] && users[currentUser].balance) || localStorage.getItem(BAL_KEY)) || 1000;
  } else {
    balance = parseInt(localStorage.getItem(BAL_KEY)) || 1000;
  }
}catch(e){ balance = parseInt(localStorage.getItem(BAL_KEY)) || 1000; }
let minesSet = new Set();
let revealed = new Set();
let inRound = false;
let betAmount = 0;
let minesCount = 5;
let multiplier = 1;
let winAmount = 0;
let gameOver = false;
let cashoutIsRestart = false;

balanceEl.textContent = balance;
// attach an animated balance-change element under the balance
balanceEl.parentElement.style.position = 'relative';
balanceChangeEl.className = 'balance-change';
balanceEl.parentElement.appendChild(balanceChangeEl);

// cashout behavior: when in round it cashes out, otherwise it can act as Restart
function setCashoutMode(mode){
  if(mode === 'round'){
    cashoutIsRestart = false;
    cashoutBtn.disabled = !inRound;
    cashoutBtn.classList.remove('restart-pulse');
    updateCashout();
  } else if(mode === 'restart'){
    cashoutIsRestart = true;
    cashoutBtn.disabled = false;
    cashoutBtn.textContent = 'Restart';
    cashoutBtn.classList.add('restart-pulse');
  }
}

// initial mode
setCashoutMode('round');

// Sounds
const popSound = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_5f203e1cd1.mp3?filename=click-14499.mp3");
const bombSound = new Audio("https://cdn.pixabay.com/download/audio/2022/03/17/audio_1b9c3f4c1b.mp3?filename=bomb-2815.mp3");
const cashSound = new Audio("https://cdn.pixabay.com/download/audio/2021/09/10/audio_4f8b35a7b1.mp3?filename=coin-5701.mp3");
// confetti removed — no confetti sound

// Quick bets
maxBtn.onclick = ()=>betInput.value = balance;
halfBtn.onclick = ()=>betInput.value = Math.floor(balance/2);
randBtn.onclick = ()=>betInput.value = Math.floor(Math.random()*balance)+1;

// Helpers
function saveBalance(){
  if(currentUser){
    const users = loadUsers();
    users[currentUser] = users[currentUser] || {};
    users[currentUser].balance = balance;
    saveUsers(users);
  } else {
    localStorage.setItem(BAL_KEY,balance);
  }
  balanceEl.textContent = balance;
}
function showFloatingText(text,color){
  floatingText.textContent=text;
  floatingText.style.color=color;
  floatingText.style.opacity=1;
  floatingText.animate([{transform:"translate(-50%, -50%)",opacity:1},{transform:"translate(-50%, -120%)",opacity:0}],{duration:1200});
  setTimeout(()=>floatingText.style.opacity=0,1200);
}
function flashScreen(color="red",opacity=0.3){
  flashOverlay.style.background=color;
  flashOverlay.style.opacity=opacity;
  flashOverlay.animate([{opacity:opacity},{opacity:0}],{duration:300,fill:"forwards"});
}

function showBalanceChange(amount){
  const sign = amount>0?'+':'';
  balanceChangeEl.textContent = sign + amount;
  balanceChangeEl.className = 'balance-change ' + (amount>0? 'gain' : 'loss') + ' show';
  // clear after animation finishes to avoid visual flash — use animationend
  const handler = (e)=>{
    // only react to our balanceRise animation
    if(e.animationName && e.animationName.indexOf('balanceRise')!==-1){
      balanceChangeEl.classList.remove('show');
      balanceChangeEl.textContent = '';
      balanceChangeEl.removeEventListener('animationend', handler);
    }
  };
  // ensure we don't add duplicate handlers
  balanceChangeEl.removeEventListener('animationend', handler);
  balanceChangeEl.addEventListener('animationend', handler);
}

// Grid
function generateGrid(){
  gridEl.innerHTML="";
  minesSet.clear(); revealed.clear(); multiplier=1; winAmount=0;
  cashoutBtn.disabled=true; inRound=false; gameOver=false;
  // hide lost modal (in case it was shown)
  if(typeof lostModal !== 'undefined') lostModal.classList.remove('visible');
  // ensure cashout is back to normal (disabled) until round starts
  setCashoutMode('round');
  // remove any restart pulse class
  cashoutBtn.classList.remove('restart-pulse');
  percentageEl.textContent="1.0x";
  for(let i=0;i<GRID_SIZE;i++){
    const cell=document.createElement("button");
    cell.className="cell";
    cell.dataset.id=i;
    cell.onclick=()=> firstClickStart(cell);
    gridEl.appendChild(cell);
  }
  // grid entrance animation
  gridEl.classList.remove('fade-in');
  void gridEl.offsetWidth; // force reflow
  gridEl.classList.add('fade-in');
}
generateGrid();

function firstClickStart(cell){
  if(!inRound){
    if(gameOver){ showFloatingText("Round over — press Restart","red"); return; }
    
    // Check if user is banned before allowing bet
    if(currentUser && isUserBanned(currentUser)){
      const mins = getBanTimeRemaining(currentUser);
      showFloatingText(`Account banned: ${mins}m remaining`,"red");
      showNotification(`Your account is banned. ${mins} minute(s) remaining.`, 'warning');
      return;
    }
    
    minesCount=parseInt(minesInput.value); if(minesCount<1) minesCount=1; if(minesCount>24) minesCount=24;
    betAmount=parseInt(betInput.value); if(betAmount<1) betAmount=1;
    if(betAmount>balance){ showFloatingText("Not enough balance!","red"); return; }
    startRound();
  }
  onCellClick(cell);
}

function startRound(){
  inRound=true; revealed.clear(); multiplier=1; winAmount=0;
  cashoutBtn.disabled=false;
  setCashoutMode('round');
  while(minesSet.size<minesCount){ minesSet.add(Math.floor(Math.random()*GRID_SIZE)); }
  balance -= betAmount; saveBalance();
  updateCashout();
}

function onCellClick(cell){
  if(!inRound || gameOver) return;
  const id=Number(cell.dataset.id); if(revealed.has(id)) return;
  revealed.add(id);

  if(minesSet.has(id)){
    // reveal the clicked bomb
    cell.classList.add("mine"); cell.innerHTML="💣";
    flashScreen("red",0.3); bombSound.currentTime=0; bombSound.play();
    showBalanceChange(-betAmount);
    inRound = false; gameOver = true;

    // record loss in user stats if logged in
    if(currentUser){
      const users = loadUsers();
      users[currentUser] = users[currentUser] || {};
      users[currentUser].stats = users[currentUser].stats || { wins:0, losses:0, totalLost:0, boardsCleared:0, totalProfit:0 };
      users[currentUser].stats.losses = (users[currentUser].stats.losses||0) + 1;
      users[currentUser].stats.totalLost = (users[currentUser].stats.totalLost||0) + betAmount;
      users[currentUser].stats.totalProfit = (users[currentUser].stats.totalProfit||0) - betAmount;
      saveUsers(users);
    }

    // reveal other bombs in a staggered sequence so it looks nicer
    const others = Array.from(minesSet).filter(x => x !== id);
    others.forEach((mId, idx) => {
      setTimeout(()=>{
        try{
          const other = gridEl.querySelector(`button[data-id="${mId}"]`);
          if(other && !other.classList.contains('mine')){
            other.classList.add('mine','reveal');
            other.innerHTML = '💣';
            // remove reveal class after animation
            setTimeout(()=> other.classList.remove('reveal'), 350);
          }
        }catch(e){ }
      }, idx * 90);
    });

    // after stagger completes, show modal and enable Restart mode
    const totalDelay = Math.max(350, others.length * 90 + 220);
    setTimeout(()=>{
      if(typeof lostModal !== 'undefined'){
        lostMsg.textContent = "Round lost";
        lostModal.classList.add('visible');
      }
      setCashoutMode('restart');
    }, totalDelay);

    return;
  }

  cell.classList.add("revealed"); cell.innerHTML="💠";
  popSound.currentTime=0; popSound.play();
  // add pop animation class and remove it after animation
  cell.classList.add('pop');
  const popHandler = ()=>{ cell.classList.remove('pop'); cell.removeEventListener('animationend', popHandler); };
  cell.addEventListener('animationend', popHandler);
    // Probability-based fair multiplier:
    // For each safe click, compute the probability of picking a safe tile
    // just before the click: P_safe = remaining_safe / remaining_total
    // The marginal multiplier for that pick = 1 / P_safe = remaining_total / remaining_safe
    // We update the cumulative multiplier by multiplying by each marginal.
    const safeTotal = Math.max(0, GRID_SIZE - minesCount); // total safe tiles at round start
    // number of picks already made BEFORE this click
    const picksBefore = Math.max(0, revealed.size - 1);
    const remTotalBefore = GRID_SIZE - picksBefore;
    const remSafeBefore = Math.max(0, safeTotal - picksBefore);
    let marginal = 1;
    if (remSafeBefore > 0) {
      marginal = remTotalBefore / remSafeBefore;
    } else {
      marginal = 1; // degenerate case (shouldn't normally happen)
    }
    multiplier = (multiplier || 1) * marginal;
    // winAmount is the gross return (bet * cumulative multiplier). Bet was
    // deducted at round start, so adding this value restores bet + profit.
    winAmount = Math.floor((betAmount || 0) * multiplier);
  updateCashout();
  percentageEl.textContent=multiplier.toFixed(2)+"x";

  if(revealed.size>=GRID_SIZE-minesSet.size) handleWin();
}

function updateCashout(){
  if(cashoutIsRestart){
    cashoutBtn.textContent = 'Restart';
    cashoutBtn.disabled = false;
    return;
  }
  cashoutBtn.textContent=`Cashout ${winAmount} 💎 (${multiplier.toFixed(2)}x)`;
  cashoutBtn.disabled=!inRound;
}

cashoutBtn.onclick=()=>{
  if(cashoutIsRestart){
    generateGrid();
    setCashoutMode('round');
    return;
  }
  if(!inRound) return;
  handleWin();
};

function handleWin(){
  showBalanceChange(winAmount);
  balance+=winAmount; saveBalance();
  cashSound.currentTime=0; cashSound.play();
  // update stats for win/profit and boards cleared
  if(currentUser){
    const users = loadUsers();
    users[currentUser] = users[currentUser] || {};
    users[currentUser].stats = users[currentUser].stats || { wins:0, losses:0, totalLost:0, boardsCleared:0, totalProfit:0 };
    users[currentUser].stats.wins = (users[currentUser].stats.wins||0) + 1;
    const profit = (winAmount || 0) - (betAmount || 0);
    users[currentUser].stats.totalProfit = (users[currentUser].stats.totalProfit||0) + profit;
    // if the player actually cleared the whole board (revealed all safe tiles), count it
    if(revealed.size >= GRID_SIZE - minesSet.size){
      users[currentUser].stats.boardsCleared = (users[currentUser].stats.boardsCleared||0) + 1;
    }
    saveUsers(users);
  }
  inRound=false; cashoutBtn.disabled=true; gameOver = true;
  // make cashout act as Restart after a win
  setCashoutMode('restart');
}

// Restart handled by modal's Restart button (and generateGrid)

// Claim Rewards (hourly cooldown)
const REWARD_AMOUNT = 250;
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

function isRewardReady(){
  const last = parseInt(localStorage.getItem(DAILY_KEY)) || 0;
  return (Date.now() - last) >= COOLDOWN_MS;
}

function formatMs(ms){
  if(ms <= 0) return '00:00';
  const sec = Math.floor(ms/1000);
  const hours = Math.floor(sec/3600);
  const mins = Math.floor((sec % 3600)/60);
  const secs = sec % 60;
  if(hours > 0) return `${hours}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

function updateDailyButton(){
  try{ }
  catch(e){}
  const last = parseInt(localStorage.getItem(DAILY_KEY)) || 0;
  const elapsed = Date.now() - last;
  const remaining = Math.max(0, COOLDOWN_MS - elapsed);
  if(remaining <= 0){
    dailyBtn.textContent = 'Claim Rewards';
    dailyBtn.classList.add('bounce');
    dailyBtn.disabled = false;
  } else {
    dailyBtn.classList.remove('bounce');
    dailyBtn.disabled = true;
    dailyBtn.textContent = `Claim Rewards (${formatMs(remaining)})`;
  }
}

dailyBtn.onclick = ()=>{
  if(!isRewardReady()){ showFloatingText('Rewards not ready','red'); return; }
  // award reward and start cooldown
  balance += REWARD_AMOUNT; saveBalance();
  localStorage.setItem(DAILY_KEY, String(Date.now()));
  showFloatingText(`+${REWARD_AMOUNT}`,'rgba(46,204,113,0.8)');
  updateDailyButton();
};

// keep the button state updated (live countdown and bounce when ready)
updateDailyButton();
setInterval(updateDailyButton, 1000);

// Confetti removed — no createConfetti implementation
