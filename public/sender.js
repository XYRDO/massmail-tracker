// ─── PARTICLES ─────────────────────────────────────────────────────────
(function(){const c=document.getElementById('particleCanvas');if(!c)return;const x=c.getContext('2d');let w,h,p=[];function r(){w=c.width=innerWidth;h=c.height=innerHeight}r();addEventListener('resize',r);for(let i=0;i<50;i++)p.push({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.5+.5,dx:(Math.random()-.5)*.3,dy:(Math.random()-.5)*.3,o:Math.random()*.3+.05});(function d(){x.clearRect(0,0,w,h);p.forEach(t=>{x.beginPath();x.arc(t.x,t.y,t.r,0,Math.PI*2);x.fillStyle=`rgba(99,102,241,${t.o})`;x.fill();t.x+=t.dx;t.y+=t.dy;if(t.x<0||t.x>w)t.dx*=-1;if(t.y<0||t.y>h)t.dy*=-1});requestAnimationFrame(d)})()})();

// ─── SENDER PAGE ───────────────────────────────────────────────────────
const socket = io();
const campaignId = location.pathname.split('/').pop();

const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const senderInterface = document.getElementById('senderInterface');
const actionArea = document.getElementById('actionArea');
const successState = document.getElementById('successState');

let campaign = null;
let hasSent = false;

// Check if this user already sent (localStorage)
const sentKey = `sent_${campaignId}`;

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

  // Distribute Target Email (Round Robin)
  const targets = campaign.recipientEmail.split(/[\n,]+/).map(e => e.trim()).filter(Boolean);
  const assignedTarget = targets[campaign.totalSent % targets.length] || targets[0];
  campaign.assignedTarget = assignedTarget;
  campaign._allTargets = targets;

  document.getElementById('previewTo').textContent = assignedTarget;
  if (targets.length > 1) {
    document.getElementById('previewTo').textContent = assignedTarget + ` (Target ${(campaign.totalSent % targets.length) + 1} of ${targets.length})`;
  }

  // CC / BCC
  if (campaign.ccEmail) {
    document.getElementById('ccRow').style.display = '';
    document.getElementById('previewCc').textContent = campaign.ccEmail;
  }
  if (campaign.bccEmail) {
    document.getElementById('bccRow').style.display = '';
    document.getElementById('previewBcc').textContent = campaign.bccEmail;
  }

  document.getElementById('previewSubject').textContent = campaign.subject;
  document.getElementById('previewBody').textContent = campaign.body;
  document.title = `Join: ${campaign.name} — MASSMAIL TRACKER`;

  // If user already sent, show success but allow sending again
  if (localStorage.getItem(sentKey)) {
    // Don't block — let them send again to another target
  }

  renderRecentSends();
}

function renderRecentSends() {
  const feed = document.getElementById('sendsFeed');
  const recent = (campaign.senders || []).slice(-10).reverse();
  if (recent.length === 0) {
    feed.innerHTML = '<div class="send-item" style="justify-content:center;color:var(--text-muted)">No sends yet. Be the first! 🚀</div>';
    return;
  }
  feed.innerHTML = recent.map(s => `
    <div class="send-item">
      <span class="send-item-name">${esc(s.senderName)}</span>
      <span class="send-item-time">${timeAgo(s.sentAt)}</span>
    </div>`).join('');
}

// ─── MEGA SEND BUTTON ──────────────────────────────────────────────────
document.getElementById('megaSendBtn').addEventListener('click', async () => {
  const senderName = document.getElementById('senderName').value.trim() || 'Anonymous';
  const btn = document.getElementById('megaSendBtn');

  // Build mailto link
  const subject = encodeURIComponent(campaign.subject);
  const body = encodeURIComponent(campaign.body);
  let mailto = `mailto:${campaign.assignedTarget}?subject=${subject}&body=${body}`;
  if (campaign.ccEmail) mailto += `&cc=${encodeURIComponent(campaign.ccEmail)}`;
  if (campaign.bccEmail) mailto += `&bcc=${encodeURIComponent(campaign.bccEmail)}`;

  // Open mailto
  window.open(mailto, '_self');

  // Auto-record after 2 seconds (trust-based — they clicked the button)
  btn.innerHTML = '<span class="spinner" style="width:22px;height:22px;border-width:2px;margin:0"></span> <span>Opening your email app...</span>';
  btn.disabled = true;

  setTimeout(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderName })
      });
      const data = await res.json();

      // Mark as sent
      localStorage.setItem(sentKey, Date.now().toString());

      // Show success
      actionArea.style.display = 'none';
      successState.classList.remove('hidden');
      document.getElementById('successTotal').textContent = data.totalSent;
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
        <span>Send Email Now</span>
        <small>Opens your email app with everything pre-filled. Just hit Send!</small>`;
      alert('Error recording your send. Please try again.');
    }
  }, 2500);
});

// ─── COPY TO CLIPBOARD FALLBACK ────────────────────────────────────────
document.getElementById('copyAllBtn').addEventListener('click', () => {
  const text = `TO: ${campaign.assignedTarget}\n${campaign.ccEmail ? 'CC: ' + campaign.ccEmail + '\n' : ''}${campaign.bccEmail ? 'BCC: ' + campaign.bccEmail + '\n' : ''}SUBJECT: ${campaign.subject}\n\n${campaign.body}`;
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.createElement('div');
    toast.className = 'copy-toast';
    toast.textContent = '✅ Email content copied! Paste it into your email app.';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  });
});

// ─── SEND ANOTHER BUTTON ──────────────────────────────────────────────
document.getElementById('sendAnotherBtn').addEventListener('click', () => {
  successState.classList.add('hidden');
  actionArea.style.display = '';

  // Re-render to get next round-robin target
  loadCampaign();
});

// ─── REAL-TIME UPDATES ─────────────────────────────────────────────────
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
