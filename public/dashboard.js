// ─── PARTICLES ─────────────────────────────────────────────────────────
(function(){const c=document.getElementById('particleCanvas');if(!c)return;const x=c.getContext('2d');let w,h,p=[];function r(){w=c.width=innerWidth;h=c.height=innerHeight}r();addEventListener('resize',r);for(let i=0;i<50;i++)p.push({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.5+.5,dx:(Math.random()-.5)*.3,dy:(Math.random()-.5)*.3,o:Math.random()*.3+.05});(function d(){x.clearRect(0,0,w,h);p.forEach(t=>{x.beginPath();x.arc(t.x,t.y,t.r,0,Math.PI*2);x.fillStyle=`rgba(99,102,241,${t.o})`;x.fill();t.x+=t.dx;t.y+=t.dy;if(t.x<0||t.x>w)t.dx*=-1;if(t.y<0||t.y>h)t.dy*=-1});requestAnimationFrame(d)})()})();

// ─── DASHBOARD PAGE ────────────────────────────────────────────────────
const socket = io();
const campaignId = location.pathname.split('/').pop();

const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const dashboardContent = document.getElementById('dashboardContent');

let campaign = null;
let sendTimestamps = []; // For rate calculation

async function loadCampaign() {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}`);
    if (!res.ok) throw new Error();
    campaign = await res.json();
    sendTimestamps = (campaign.senders || []).map(s => new Date(s.sentAt).getTime());
    renderDashboard();
  } catch {
    loadingState.classList.add('hidden');
    errorState.classList.remove('hidden');
  }
}

function renderDashboard() {
  loadingState.classList.add('hidden');
  dashboardContent.classList.remove('hidden');

  document.getElementById('dashTitle').textContent = campaign.name;
  document.title = `Dashboard: ${campaign.name} — MASSMAIL TRACKER`;

  updateStats();
  renderFeed();
  renderTable();
}

function updateStats() {
  const total = campaign.totalSent || 0;
  document.getElementById('dashTotal').textContent = total;
  document.getElementById('progressText').textContent = `${total} emails`;

  // Progress bar (arbitrary max of 100 for visual, scales)
  const pct = Math.min((total / Math.max(total, 50)) * 100, 100);
  document.getElementById('progressFill').style.width = pct + '%';

  // Last sent
  const senders = campaign.senders || [];
  if (senders.length > 0) {
    const last = senders[senders.length - 1];
    document.getElementById('dashLastSent').textContent = timeAgo(last.sentAt);
  }

  // Rate (sends per hour in last hour)
  const oneHourAgo = Date.now() - 3600000;
  const recentCount = sendTimestamps.filter(t => t > oneHourAgo).length;
  document.getElementById('dashRate').textContent = recentCount;
}

function renderFeed() {
  const feed = document.getElementById('liveFeed');
  const senders = (campaign.senders || []).slice(-20).reverse();
  if (senders.length === 0) {
    feed.innerHTML = '<div class="feed-empty">Waiting for sends...</div>';
    return;
  }
  feed.innerHTML = senders.map(s => feedItemHTML(s)).join('');
}

function renderTable() {
  const tbody = document.getElementById('sendersBody');
  const senders = (campaign.senders || []).slice().reverse();
  tbody.innerHTML = senders.map((s, i) => `
    <tr>
      <td style="color:var(--text-muted)">${senders.length - i}</td>
      <td><strong>${esc(s.senderName)}</strong></td>
      <td style="color:var(--text-muted);font-family:var(--mono);font-size:0.75rem">${new Date(s.sentAt).toLocaleString()}</td>
    </tr>`).join('');
}

function feedItemHTML(s, isNew = false) {
  const initials = s.senderName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return `
    <div class="feed-item${isNew ? ' new' : ''}">
      <div class="feed-item-left">
        <div class="feed-avatar">${initials || '?'}</div>
        <span class="feed-name">${esc(s.senderName)}</span>
      </div>
      <span class="feed-time">${timeAgo(s.sentAt)}</span>
    </div>`;
}

// Real-time updates
socket.on('emailSent', (data) => {
  if (data.campaignId !== campaignId) return;

  campaign.totalSent = data.totalSent;
  if (!campaign.senders) campaign.senders = [];
  campaign.senders.push(data.sendRecord);
  sendTimestamps.push(new Date(data.sendRecord.sentAt).getTime());

  // Animate counter
  const totalEl = document.getElementById('dashTotal');
  totalEl.textContent = data.totalSent;
  totalEl.style.animation = 'countPop 0.3s ease';
  setTimeout(() => totalEl.style.animation = '', 350);

  updateStats();

  // Prepend to feed
  const feed = document.getElementById('liveFeed');
  const empty = feed.querySelector('.feed-empty');
  if (empty) empty.remove();

  const temp = document.createElement('div');
  temp.innerHTML = feedItemHTML(data.sendRecord, true);
  feed.insertBefore(temp.firstElementChild, feed.firstChild);
  while (feed.children.length > 20) feed.removeChild(feed.lastChild);

  // Remove new highlight after 3s
  setTimeout(() => {
    const first = feed.firstElementChild;
    if (first) first.classList.remove('new');
  }, 3000);

  renderTable();
});

socket.on('campaignReset', (id) => {
  if (id === campaignId) {
    campaign.senders = [];
    campaign.totalSent = 0;
    sendTimestamps = [];
    renderDashboard();
  }
});

// Helpers
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return Math.floor(diff/86400) + 'd ago';
}

loadCampaign();
