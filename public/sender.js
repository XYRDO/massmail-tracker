// ─── PARTICLES ─────────────────────────────────────────────────────────
(function(){const c=document.getElementById('particleCanvas');if(!c)return;const x=c.getContext('2d');let w,h,p=[];function r(){w=c.width=innerWidth;h=c.height=innerHeight}r();addEventListener('resize',r);for(let i=0;i<50;i++)p.push({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.5+.5,dx:(Math.random()-.5)*.3,dy:(Math.random()-.5)*.3,o:Math.random()*.3+.05});(function d(){x.clearRect(0,0,w,h);p.forEach(t=>{x.beginPath();x.arc(t.x,t.y,t.r,0,Math.PI*2);x.fillStyle=`rgba(99,102,241,${t.o})`;x.fill();t.x+=t.dx;t.y+=t.dy;if(t.x<0||t.x>w)t.dx*=-1;if(t.y<0||t.y>h)t.dy*=-1});requestAnimationFrame(d)})()})();

// ─── SENDER PAGE ───────────────────────────────────────────────────────
const socket = io();
const campaignId = location.pathname.split('/').pop();

const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const senderInterface = document.getElementById('senderInterface');
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const successState = document.getElementById('successState');
const stepsContainer = document.querySelector('.steps-container');

let campaign = null;

// Load campaign
async function loadCampaign() {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}`);
    if (!res.ok) throw new Error('Not found');
    campaign = await res.json();
    renderCampaign();
  } catch (e) {
    loadingState.classList.add('hidden');
    errorState.classList.remove('hidden');
  }
}

function renderCampaign() {
  loadingState.classList.add('hidden');
  senderInterface.classList.remove('hidden');

  document.getElementById('campaignTitle').textContent = campaign.name;
  document.getElementById('liveCount').textContent = campaign.totalSent;
  document.getElementById('previewTo').textContent = campaign.recipientEmail;
  document.getElementById('previewSubject').textContent = campaign.subject;
  document.getElementById('previewBody').textContent = campaign.body;
  document.title = `Send: ${campaign.name} — MASSMAIL TRACKER`;

  renderRecentSends();
}

function renderRecentSends() {
  const feed = document.getElementById('sendsFeed');
  const recent = (campaign.senders || []).slice(-10).reverse();
  if (recent.length === 0) {
    feed.innerHTML = '<div class="send-item" style="justify-content:center;color:var(--text-muted)">No sends yet. Be the first!</div>';
    return;
  }
  feed.innerHTML = recent.map(s => `
    <div class="send-item">
      <span class="send-item-name">${esc(s.senderName)}</span>
      <span class="send-item-time">${timeAgo(s.sentAt)}</span>
    </div>`).join('');
}

// Step navigation
document.getElementById('step1Next').addEventListener('click', () => {
  step1.classList.remove('active');
  step1.classList.add('done');
  step2.classList.add('active');
});

document.getElementById('openMailBtn').addEventListener('click', () => {
  const subject = encodeURIComponent(campaign.subject);
  const body = encodeURIComponent(campaign.body);
  const mailto = `mailto:${campaign.recipientEmail}?subject=${subject}&body=${body}`;
  window.open(mailto, '_self');

  // After a short delay, activate step 3
  setTimeout(() => {
    step2.classList.remove('active');
    step2.classList.add('done');
    step3.classList.add('active');
  }, 1500);
});

document.getElementById('confirmBtn').addEventListener('click', async () => {
  const senderName = document.getElementById('senderName').value.trim() || 'Anonymous';
  const btn = document.getElementById('confirmBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;margin:0"></span> Recording...';

  try {
    const res = await fetch(`/api/campaigns/${campaignId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderName })
    });
    const data = await res.json();

    // Hide steps, show success
    stepsContainer.style.display = 'none';
    successState.classList.remove('hidden');
    document.getElementById('successTotal').textContent = data.totalSent;
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = '✅ Yes, I Sent It!';
    alert('Error recording send. Please try again.');
  }
});

// Real-time updates
socket.on('emailSent', (data) => {
  if (data.campaignId !== campaignId) return;

  // Update counter with animation
  const countEl = document.getElementById('liveCount');
  countEl.textContent = data.totalSent;
  countEl.style.animation = 'countPop 0.3s ease';
  setTimeout(() => countEl.style.animation = '', 350);

  // Update success total too
  document.getElementById('successTotal').textContent = data.totalSent;

  // Add to recent feed
  const feed = document.getElementById('sendsFeed');
  const firstChild = feed.firstElementChild;
  const hasEmpty = firstChild && firstChild.textContent.includes('No sends yet');
  if (hasEmpty) feed.innerHTML = '';

  const item = document.createElement('div');
  item.className = 'send-item';
  item.innerHTML = `
    <span class="send-item-name">${esc(data.sendRecord.senderName)}</span>
    <span class="send-item-time">just now</span>`;
  feed.insertBefore(item, feed.firstChild);

  // Keep max 10
  while (feed.children.length > 10) feed.removeChild(feed.lastChild);
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
