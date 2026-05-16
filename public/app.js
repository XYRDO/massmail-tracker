// ─── PARTICLES ─────────────────────────────────────────────────────────
(function(){const c=document.getElementById('particleCanvas');if(!c)return;const x=c.getContext('2d');let w,h,p=[];function r(){w=c.width=innerWidth;h=c.height=innerHeight}r();addEventListener('resize',r);for(let i=0;i<50;i++)p.push({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.5+.5,dx:(Math.random()-.5)*.3,dy:(Math.random()-.5)*.3,o:Math.random()*.3+.05});(function d(){x.clearRect(0,0,w,h);p.forEach(t=>{x.beginPath();x.arc(t.x,t.y,t.r,0,Math.PI*2);x.fillStyle=`rgba(99,102,241,${t.o})`;x.fill();t.x+=t.dx;t.y+=t.dy;if(t.x<0||t.x>w)t.dx*=-1;if(t.y<0||t.y>h)t.dy*=-1});requestAnimationFrame(d)})()})();

// ─── HOMEPAGE APP ──────────────────────────────────────────────────────
const socket = io();

const form = document.getElementById('campaignForm');
const grid = document.getElementById('campaignsGrid');
const emptyState = document.getElementById('emptyState');
const toggleBtn = document.getElementById('toggleBtn');
const createToggle = document.getElementById('createToggle');
const totalCampaignsEl = document.getElementById('totalCampaigns');
const totalEmailsEl = document.getElementById('totalEmailsSent');

let campaigns = [];

// Toggle form
createToggle.addEventListener('click', () => {
  form.classList.toggle('open');
  toggleBtn.classList.toggle('open');
});

// Char counter
const bodyInput = document.getElementById('emailBody');
const charCount = document.getElementById('charCount');
bodyInput.addEventListener('input', () => {
  const len = bodyInput.value.length;
  charCount.textContent = len;
  charCount.parentElement.className = 'char-counter' + (len > 1800 ? ' danger' : len > 1400 ? ' warn' : '');
});

// Create campaign
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    name: document.getElementById('campaignName').value.trim(),
    recipientEmail: document.getElementById('recipientEmail').value.trim(),
    ccEmail: document.getElementById('ccEmail').value.trim(),
    bccEmail: document.getElementById('bccEmail').value.trim(),
    subject: document.getElementById('emailSubject').value.trim(),
    body: document.getElementById('emailBody').value.trim()
  };
  const res = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (res.ok) {
    form.reset(); charCount.textContent = '0';
    form.classList.remove('open'); toggleBtn.classList.remove('open');
    loadCampaigns();
  }
});

// Load campaigns
async function loadCampaigns() {
  const res = await fetch('/api/campaigns');
  campaigns = await res.json();
  renderCampaigns();
  updateStats();
}

function updateStats() {
  totalCampaignsEl.textContent = campaigns.length;
  totalEmailsEl.textContent = campaigns.reduce((sum, c) => sum + (c.totalSent || 0), 0);
}

function renderCampaigns() {
  if (campaigns.length === 0) {
    grid.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  grid.innerHTML = campaigns.map(c => {
    const sendUrl = `${location.origin}/send/${c.id}`;
    const dashUrl = `${location.origin}/dashboard/${c.id}`;
    return `
      <div class="campaign-card" id="card-${c.id}">
        <div class="card-top">
          <div>
            <div class="card-title">${esc(c.name)}</div>
            <div class="card-meta">
              <span title="${esc(c.recipientEmail)}">📧 ${formatEmails(c.recipientEmail)}</span>
              <span>📝 ${esc(c.subject.slice(0,40))}${c.subject.length>40?'...':''}</span>
            </div>
          </div>
          <div class="card-count">${c.totalSent}<small>sent</small></div>
        </div>
        <div class="card-actions">
          <button class="btn btn-ghost btn-sm" onclick="copyLink('${sendUrl}')">📋 Copy Send Link</button>
          <a href="${dashUrl}" class="btn btn-ghost btn-sm">📊 Live Dashboard</a>
          <a href="${sendUrl}" class="btn btn-ghost btn-sm" target="_blank">🔗 Open Send Page</a>
          <button class="btn btn-danger btn-sm" onclick="deleteCampaign('${c.id}')">🗑 Delete</button>
        </div>
      </div>`;
  }).join('');
}

function copyLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    const toast = document.createElement('div');
    toast.className = 'copy-toast';
    toast.textContent = '✅ Link copied to clipboard!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  });
}

async function deleteCampaign(id) {
  if (!confirm('Delete this campaign? This cannot be undone.')) return;
  await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
  loadCampaigns();
}

function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function formatEmails(str) {
  const arr = str.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  if (arr.length <= 1) return esc(arr[0] || str);
  return `${arr.length} Target Addresses`;
}

// Real-time updates
socket.on('emailSent', (data) => {
  const card = document.getElementById(`card-${data.campaignId}`);
  if (card) {
    const countEl = card.querySelector('.card-count');
    countEl.innerHTML = `${data.totalSent}<small>sent</small>`;
    countEl.style.animation = 'countPop 0.3s ease';
    setTimeout(() => countEl.style.animation = '', 350);
  }
  const c = campaigns.find(x => x.id === data.campaignId);
  if (c) c.totalSent = data.totalSent;
  updateStats();
});

socket.on('campaignDeleted', () => loadCampaigns());
socket.on('campaignReset', () => loadCampaigns());

loadCampaigns();
