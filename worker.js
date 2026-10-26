// help-with-kch Worker — membership & complaints system
// Preserves existing behaviour: blocks US visitors, serves static assets for existing pages.
// Adds dynamic routes: /join, /login, /member, /logout, /admin/login, /admin, /admin/member/:id, /admin/hospital/:name
//
// Bindings required (see wrangler.jsonc):
//   ASSETS  - Workers Assets (existing static site)
//   DB      - D1 database (help-with-kch)
//   AI      - Workers AI binding
//   SESSION_SECRET - Workers Secret (random string) for signing session cookies

const enc = new TextEncoder();

// ---------- crypto / encoding helpers ----------
function b64encode(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function bytesToHex(b) { return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(h) {
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
  return a;
}

async function hmacSign(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return b64encode(sig);
}

async function hashPassword(password, saltHex) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, 256);
  return bytesToHex(salt) + ':' + bytesToHex(new Uint8Array(bits));
}
async function verifyPassword(password, stored) {
  const idx = stored.indexOf(':');
  const saltHex = stored.slice(0, idx);
  const hash = await hashPassword(password, saltHex);
  return hash === stored;
}

async function makeSessionCookie(secret, payload) {
  const p = btoa(JSON.stringify(payload));
  const sig = await hmacSign(secret, p);
  return `${p}.${sig}`;
}
async function verifySessionCookie(secret, cookie) {
  const [p, sig] = (cookie || '').split('.');
  if (!p || !sig) return null;
  const expected = await hmacSign(secret, p);
  if (sig !== expected) return null;
  try { return JSON.parse(atob(p)); } catch { return null; }
}

function getCookie(req, name) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
function sessionCookieHeader(value, maxAge) {
  return `sid=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
function clearCookieHeader() {
  return `sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function html(page, status = 200) {
  return new Response(page, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ---------- HTML layout ----------
function layout(title, body, extraHead = '') {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { --bg:#f7f8fa; --card:#fff; --ink:#1c2330; --muted:#5b6675; --accent:#1a73e8; --border:#d8dee6; --danger:#c0392b; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  header { background:#0b2a4a; color:#fff; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; }
  header a { color:#fff; text-decoration:none; margin-left:14px; font-size:14px; }
  main { max-width:820px; margin:24px auto; padding:0 16px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:22px; margin-bottom:18px; }
  h1 { font-size:22px; margin:0 0 6px; }
  h2 { font-size:18px; margin:18px 0 8px; }
  label { display:block; font-weight:600; margin:10px 0 4px; }
  input, select, textarea { width:100%; padding:9px 10px; border:1px solid var(--border); border-radius:7px; font:inherit; }
  textarea { resize:vertical; }
  .row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .row3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
  button { background:var(--accent); color:#fff; border:0; border-radius:8px; padding:11px 18px; font:inherit; font-weight:600; cursor:pointer; }
  button.secondary { background:#eef1f6; color:var(--ink); }
  button.danger { background:var(--danger); }
  .check { display:flex; align-items:center; gap:8px; }
  .check input { width:auto; }
  .muted { color:var(--muted); }
  .error { color:var(--danger); background:#fdecea; border:1px solid #f5c6c0; padding:10px 12px; border-radius:7px; margin-bottom:12px; }
  .ok { color:#1e7e34; background:#eafaf0; border:1px solid #bfe6cd; padding:10px 12px; border-radius:7px; margin-bottom:12px; }
  table { width:100%; border-collapse:collapse; }
  th, td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--border); }
  th { background:#f0f3f7; }
  a { color:var(--accent); }
  .complaint-block { border:1px dashed var(--border); border-radius:8px; padding:14px; margin-bottom:10px; }
  .print-btn { margin:16px 0; }
  @media print { header, .print-btn, .no-print { display:none; } body { background:#fff; } }
</style>
${extraHead}
</head>
<body>
<header>
  <strong>Help with KCH</strong>
  <nav>
    <a href="/">Home</a>
    <a href="/join">Join</a>
    <a href="/login">Member login</a>
    <a href="/admin/login">Admin</a>
  </nav>
</header>
<main>
${body}
</main>
</body>
</html>`;
}

// ---------- pages ----------
function joinPage(error = '') {
  const errBlock = error ? `<div class="error">${escapeHtml(error)}</div>` : '';
  return layout('Join — Share your story', `
  ${errBlock}
  <div class="card">
    <h1>Share your story</h1>
    <p class="muted">Register to submit your experience. You will be able to log in later to view your own printable booklet.</p>
    <form id="joinForm">
      <h2>Your account</h2>
      <div class="row">
        <div><label>Email (your username)</label><input name="email" type="email" required></div>
        <div><label>Password</label><input name="password" type="password" required minlength="8"></div>
      </div>
      <h2>Personal data</h2>
      <div class="row3">
        <div><label>First name</label><input name="first_name" required></div>
        <div><label>Middle name</label><input name="middle_name"></div>
        <div><label>Last name</label><input name="last_name" required></div>
      </div>
      <div class="row3">
        <div><label>Sex</label><input name="sex"></div>
        <div><label>Race</label><input name="race"></div>
        <div><label>Date of birth</label><input name="date_of_birth" type="date"></div>
      </div>
      <label>NHS number</label><input name="nhs_number">

      <h2>Health related</h2>
      <div class="row">
        <div><label>Hospital number</label><input name="hospital_number"></div>
        <div><label>Hospital name</label><input name="hospital_name"></div>
      </div>
      <div class="row">
        <div><label>Usual consultant</label><input name="usual_consultant"></div>
        <div><label>Hospital department</label><input name="hospital_department"></div>
      </div>

      <h2>Your sickness</h2>
      <label>Diagnosis</label><input name="diagnosis">

      <h2>Complaint format</h2>
      <div class="check"><input name="did_you_complain" type="checkbox" value="1"> <label style="margin:0">Did you complain?</label></div>
      <div class="row">
        <div class="check"><input name="complained_verbally" type="checkbox" value="1"> <label style="margin:0">Verbally</label></div>
        <div><label>Number of verbal complaints</label><input name="number_of_verbal" type="number" min="0" value="0"></div>
      </div>
      <div class="row">
        <div class="check"><input name="complained_written" type="checkbox" value="1"> <label style="margin:0">In writing</label></div>
        <div><label>Number of written complaints</label><input name="number_of_written" type="number" min="0" value="0"></div>
      </div>

      <h2>Your story (500 words or less)</h2>
      <textarea name="your_story" rows="8" maxlength="5000" placeholder="Focus on the problem areas, the problem medications, the doctors that ignored your complaints and the impact their attitude caused you."></textarea>

      <h2>Complaints <button type="button" class="secondary" id="addComplaint">+ Add another complaint</button></h2>
      <p class="muted">Each complaint carries its own department, consultant, medication and details. Add as many as you need.</p>
      <div id="complaints"></div>

      <h2>Your consent</h2>
      <div class="card" style="background:#f0f3f7;border-color:#d8dee6;">
        <p><strong>Privacy notice &amp; consent (UK GDPR — special-category data)</strong></p>
        <p class="muted">Please read our <a href="/privacy" target="_blank">privacy policy</a> before consenting. By submitting this form you confirm that:</p>
        <ul class="muted">
          <li>the information you provide is accurate to the best of your knowledge;</li>
          <li>you consent to Help with KCH storing your personal and health data (including NHS number, date of birth, diagnosis and complaint details) for the purpose of collating and presenting patient complaints to the relevant hospitals;</li>
          <li>you understand your data will be held securely and used to produce a summary that may be shared with the hospital(s) you name;</li>
          <li>you may request access to, correction of, or deletion of your data at any time by contacting Help with KCH.</li>
        </ul>
        <div class="check"><input name="consent" id="consent" type="checkbox" value="1" required> <label for="consent" style="margin:0;font-weight:600">I have read and agree to the above. I consent to my data being processed as described.</label></div>
      </div>

      <button type="submit">Submit my story</button>
    </form>
  </div>
  <script>
    const tmpl = \`<div class="complaint-block">
      <div class="row3">
        <div><label>Problem department</label><input name="problem_department"></div>
        <div><label>Problem consultant</label><input name="problem_consultant"></div>
        <div><label>Problem medication</label><input name="medication_name"></div>
      </div>
      <label>Details of this complaint</label>
      <textarea name="complaint_text" rows="3"></textarea>
      <button type="button" class="secondary" onclick="this.closest('.complaint-block').remove()">Remove</button>
    </div>\`;
    function addBlock(){ document.getElementById('complaints').insertAdjacentHTML('beforeend', tmpl); }
    document.getElementById('addComplaint').onclick = addBlock;
    addBlock();
    document.getElementById('joinForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const val = n => (f.querySelector('[name='+n+']')?.value || '').trim();
      const chk = n => f.querySelector('[name='+n+']')?.checked ? 1 : 0;
      const num = n => parseInt(f.querySelector('[name='+n+']')?.value || '0', 10) || 0;
      const complaints = [...document.querySelectorAll('.complaint-block')].map(b => ({
        problem_department: b.querySelector('[name=problem_department]').value.trim(),
        problem_consultant: b.querySelector('[name=problem_consultant]').value.trim(),
        medication_name: b.querySelector('[name=medication_name]').value.trim(),
        complaint_text: b.querySelector('[name=complaint_text]').value.trim()
      })).filter(c => c.problem_department || c.problem_consultant || c.medication_name || c.complaint_text);
      if (!document.getElementById('consent').checked) { alert('Please tick the consent box to confirm you agree to your data being processed.'); return; }
      const payload = {
        email: val('email'), password: val('password'),
        first_name: val('first_name'), middle_name: val('middle_name'), last_name: val('last_name'),
        sex: val('sex'), race: val('race'), date_of_birth: val('date_of_birth'), nhs_number: val('nhs_number'),
        hospital_number: val('hospital_number'), hospital_name: val('hospital_name'),
        usual_consultant: val('usual_consultant'), hospital_department: val('hospital_department'),
        diagnosis: val('diagnosis'),
        did_you_complain: chk('did_you_complain'), complained_verbally: chk('complained_verbally'),
        number_of_verbal: num('number_of_verbal'), complained_written: chk('complained_written'),
        number_of_written: num('number_of_written'),
        your_story: val('your_story'), consent: 1, complaints
      };
      const r = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const res = await r.json();
      if (res.ok) { location.href = '/login?registered=1'; }
      else { alert(res.error || 'Something went wrong'); }
    });
  </script>
  `);
}

function loginPage(msg = '') {
  const note = msg === 'registered' ? `<div class="ok">Registration received. Log in below to view your booklet.</div>` : '';
  return layout('Member login', `
  <div class="card">
    <h1>Member login</h1>
    ${note}
    <form id="loginForm">
      <label>Email</label><input name="email" type="email" required>
      <label>Password</label><input name="password" type="password" required>
      <button type="submit">Log in</button>
    </form>
    <p class="muted">Not a member? <a href="/join">Join here</a>.</p>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: f.email.value.trim(), password: f.password.value }) });
      const res = await r.json();
      if (res.ok) { location.href = '/member'; } else { alert(res.error || 'Login failed'); }
    });
  </script>
  `);
}

function contactPage(msg = '') {
  const note = msg === 'sent' ? `<div class="ok">Your request has been received. We will action it and confirm by email.</div>` : '';
  return layout('Contact / data request', `
  <div class="card">
    <h1>Request access, correction or deletion of your data</h1>
    ${note}
    <p class="muted">Use this form to exercise any of your UK GDPR rights — including withdrawing consent or requesting that we delete your data. You do not need to be logged in.</p>
    <form id="contactForm">
      <label>Name</label><input name="name">
      <label>Email</label><input name="email" type="email" required>
      <label>Request type</label>
      <select name="request_type">
        <option value="delete">Delete my data (right to be forgotten)</option>
        <option value="access">Access — send me a copy of my data</option>
        <option value="correct">Correct inaccurate data</option>
        <option value="withdraw">Withdraw my consent</option>
        <option value="restrict">Restrict or object to processing</option>
        <option value="other">Other</option>
      </select>
      <label>Details</label>
      <textarea name="message" rows="5" placeholder="Tell us what you need. If you are asking us to delete your data, please confirm the email address your account is registered with."></textarea>
      <button type="submit">Send request</button>
    </form>
    <p class="muted">Prefer to log in? Members can also request deletion from inside their <a href="/login">booklet page</a>.</p>
  </div>
  <script>
    document.getElementById('contactForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await fetch('/api/contact', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: f.name.value.trim(), email: f.email.value.trim(), request_type: f.request_type.value, message: f.message.value.trim() }) });
      const res = await r.json();
      if (res.ok) { location.href = '/contact?sent=1'; } else { alert(res.error || 'Something went wrong'); }
    });
  </script>
  `);
}
function privacyPage() {
  return layout('Privacy policy', `
  <div class="card">
    <h1>Privacy policy</h1>
    <p class="muted">Last updated: 26 October 2026</p>

    <h2>Who we are</h2>
    <p>Help with KCH ("we", "us") operates the website help-with-kch.co.uk. This policy explains how we collect and use your personal data when you join and submit your story.</p>

    <h2>What data we collect</h2>
    <p>When you register we collect: your name, email address (used as your username), sex, race, date of birth, NHS number, hospital number, hospital name, usual consultant, hospital department, diagnosis, whether and how you complained, your story (up to 500 words), and the complaints you add (each with its own department, consultant, medication and details).</p>
    <p>This includes <strong>special-category data</strong> under the UK GDPR (information about your health, and racial or ethnic origin). We also record the date and time you gave consent.</p>

    <h2>Why we use it (lawful basis)</h2>
    <p>We rely on your <strong>explicit consent</strong> (UK GDPR Article 9(2)(a)) to process your special-category health data, and on contract/consent for your other personal data, in order to collate patient complaints and present them to the relevant hospital(s).</p>

    <h2>How we use it</h2>
    <ul>
      <li>To create and secure your member account.</li>
      <li>To produce an AI-generated summary of your submission for your printable booklet.</li>
      <li>To produce aggregated, anonymised summaries for submission to the hospital(s) you name.</li>
    </ul>

    <h2>Where it is stored</h2>
    <p>Your data is stored in a Cloudflare D1 (SQLite) database within the European Union. Passwords are hashed (PBKDF2) and never stored in plain text. Access to your data is restricted to you and to authorised administrators.</p>

    <h2>Who sees it</h2>
    <ul>
      <li><strong>You</strong> can see only your own submission.</li>
      <li><strong>Authorised admins</strong> can see all submissions and generate hospital summaries.</li>
      <li><strong>Hospitals</strong> may receive an aggregated summary that is not attributed to you by name.</li>
    </ul>
    <p>We do not sell your data and do not share it with any other third parties.</p>

    <h2>How long we keep it</h2>
    <p>We retain your data for as long as your account is active and for as long as needed to pursue the complaints you describe, unless you ask us to delete it sooner.</p>

    <h2>Your rights</h2>
    <p>Under the UK GDPR you have the right to: access your data, correct inaccurate data, delete your data ("right to be forgotten"), restrict or object to processing, and withdraw your consent at any time (withdrawal does not affect processing already carried out). To exercise any of these rights, contact Help with KCH.</p>

    <h2>Security</h2>
    <p>Data is transmitted over HTTPS and stored on Cloudflare's platform. Sessions are secured with signed cookies. No system can be guaranteed perfectly secure, but we take reasonable technical measures to protect your data.</p>

    <h2>Contact</h2>
    <p>To ask about your data, request deletion, or withdraw consent, use our <a href="/contact">data request form</a> or contact Help with KCH through the details provided on the site.</p>

    <p><a href="/join">Back to the join form</a></p>
  </div>
  `);
}

function adminLoginPage() {
  return layout('Admin login', `
  <div class="card">
    <h1>Admin login</h1>
    <form id="adminForm">
      <label>Email</label><input name="email" type="email" required>
      <label>Password</label><input name="password" type="password" required>
      <button type="submit">Log in</button>
    </form>
  </div>
  <script>
    document.getElementById('adminForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const r = await fetch('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: f.email.value.trim(), password: f.password.value }) });
      const res = await r.json();
      if (res.ok) { location.href = '/admin'; } else { alert(res.error || 'Login failed'); }
    });
  </script>
  `);
}

function memberBookletPage(member, complaints) {
  const cs = complaints.map(c => `
    <div class="card">
      <h2>Complaint</h2>
      <div class="row3">
        <div><strong>Department:</strong><br>${escapeHtml(c.problem_department)}</div>
        <div><strong>Consultant:</strong><br>${escapeHtml(c.problem_consultant)}</div>
        <div><strong>Medication:</strong><br>${escapeHtml(c.medication_name)}</div>
      </div>
      <p>${escapeHtml(c.complaint_text)}</p>
    </div>`).join('') || '<p class="muted">No individual complaints recorded.</p>';
  return layout('Your booklet', `
    <div class="card">
      <button class="print-btn" onclick="window.print()">Print this booklet</button>
      <h1>${escapeHtml(member.first_name)} ${escapeHtml(member.last_name)}</h1>
      ${member.ai_summary ? `<h2>Summary</h2><p>${escapeHtml(member.ai_summary)}</p>` : ''}
      <h2>Personal details</h2>
      <table>
        <tr><th>Email</th><td>${escapeHtml(member.email)}</td></tr>
        <tr><th>Date of birth</th><td>${escapeHtml(member.date_of_birth)}</td></tr>
        <tr><th>Sex</th><td>${escapeHtml(member.sex)}</td></tr>
        <tr><th>Race</th><td>${escapeHtml(member.race)}</td></tr>
        <tr><th>NHS number</th><td>${escapeHtml(member.nhs_number)}</td></tr>
      </table>
      <h2>Health details</h2>
      <table>
        <tr><th>Hospital</th><td>${escapeHtml(member.hospital_name)}</td></tr>
        <tr><th>Hospital number</th><td>${escapeHtml(member.hospital_number)}</td></tr>
        <tr><th>Usual consultant</th><td>${escapeHtml(member.usual_consultant)}</td></tr>
        <tr><th>Department</th><td>${escapeHtml(member.hospital_department)}</td></tr>
        <tr><th>Diagnosis</th><td>${escapeHtml(member.diagnosis)}</td></tr>
      </table>
      <h2>Complaint format</h2>
      <table>
        <tr><th>Did you complain?</th><td>${member.did_you_complain ? 'Yes' : 'No'}</td></tr>
        <tr><th>Verbally</th><td>${member.complained_verbally ? 'Yes' : 'No'} (${member.number_of_verbal})</td></tr>
        <tr><th>In writing</th><td>${member.complained_written ? 'Yes' : 'No'} (${member.number_of_written})</td></tr>
      </table>
      <h2>Your story</h2>
      <p>${escapeHtml(member.your_story)}</p>
    </div>
    ${cs}
    <p><a href="/contact">Request deletion or access to your data</a></p>
    <form method="post" action="/logout"><button class="secondary">Log out</button></form>
  `);
}

function adminDashboardPage(members, requests) {
  const rows = members.map(m => `<tr>
    <td>${m.id}</td>
    <td>${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}</td>
    <td>${escapeHtml(m.email)}</td>
    <td>${escapeHtml(m.hospital_name)}</td>
    <td>${escapeHtml(m.created_at)}</td>
    <td><a href="/admin/member/${m.id}">View booklet</a></td>
  </tr>`).join('') || '<tr><td colspan="6">No members yet.</td></tr>';
  const hospitals = [...new Set(members.map(m => m.hospital_name).filter(Boolean))];
  const hospLinks = hospitals.map(h => `<li><a href="/admin/hospital/${encodeURIComponent(h)}">${escapeHtml(h)}</a></li>`).join('') || '<li class="muted">None yet.</li>';
  const reqRows = requests.map(r => `<tr>
    <td>${escapeHtml(r.created_at)}</td>
    <td>${escapeHtml(r.request_type)}</td>
    <td>${escapeHtml(r.name || '')}</td>
    <td>${escapeHtml(r.email)}</td>
    <td>${escapeHtml(r.message || '')}</td>
    <td>${escapeHtml(r.status)}</td>
  </tr>`).join('') || '<tr><td colspan="6" class="muted">No data requests yet.</td></tr>';
  return layout('Admin dashboard', `
    <div class="card">
      <h1>Members</h1>
      <table>
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Hospital</th><th>Joined</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="card">
      <h1>Bulk hospital summaries</h1>
      <p class="muted">Generate an aggregated AI summary of all complaints referencing each hospital, for submission to that hospital.</p>
      <ul>${hospLinks}</ul>
    </div>
    <div class="card">
      <h1>Data requests (UK GDPR)</h1>
      <p class="muted">Access, correction, deletion and consent-withdrawal requests submitted via the contact form.</p>
      <table>
        <thead><tr><th>Received</th><th>Type</th><th>Name</th><th>Email</th><th>Details</th><th>Status</th></tr></thead>
        <tbody>${reqRows}</tbody>
      </table>
    </div>
    <form method="post" action="/logout"><button class="secondary">Log out</button></form>
  `);
}

function adminMemberBookletPage(member, complaints) {
  return memberBookletPage(member, complaints);
}

function hospitalSummaryPage(hospitalName, summary, members) {
  const list = members.map(m => `<li>${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)} — ${escapeHtml(m.your_story || '').slice(0,200)}…</li>`).join('');
  return layout(`Hospital summary — ${hospitalName}`, `
    <div class="card">
      <button class="print-btn" onclick="window.print()">Print this summary</button>
      <h1>Bulk summary: ${escapeHtml(hospitalName)}</h1>
      <h2>AI summary</h2>
      <p>${escapeHtml(summary)}</p>
      <h2>Contributing members (${members.length})</h2>
      <ul>${list}</ul>
    </div>
    <p><a href="/admin">Back to dashboard</a></p>
  `);
}

// ---------- AI ----------
async function generateMemberSummary(env, member, complaints) {
  const parts = [];
  parts.push(`Diagnosis: ${member.diagnosis || 'n/a'}`);
  parts.push(`Hospital: ${member.hospital_name || 'n/a'}`);
  if (complaints.length) {
    parts.push('Complaints:');
    for (const c of complaints) {
      parts.push(`- Department: ${c.problem_department || ''}; Consultant: ${c.problem_consultant || ''}; Medication: ${c.medication_name || ''}; Details: ${c.complaint_text || ''}`);
    }
  }
  parts.push(`Patient story: ${member.your_story || 'n/a'}`);
  const prompt = `You are a careful medical-complaints summariser. Summarise the following patient submission in a concise, factual paragraph suitable for a printed booklet to be presented to hospital staff. Do not invent facts. Use a neutral, professional tone.\n\n${parts.join('\n')}`;
  try {
    const res = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'system', content: 'You are a careful medical-complaints summariser.' }, { role: 'user', content: prompt }] });
    return (res && (res.response || res.result)) || '';
  } catch (e) {
    return '';
  }
}

async function generateHospitalSummary(env, hospitalName, members) {
  const blocks = members.map((m, i) => `Member ${i + 1}: ${m.your_story || ''} (Diagnosis: ${m.diagnosis || ''})`).join('\n');
  const prompt = `You are a careful medical-complaints summariser. The following are submissions from multiple patients about the hospital "${hospitalName}". Produce a single consolidated, factual summary suitable for submission to that hospital's management. Group recurring themes. Do not invent facts or identify individuals by name.\n\n${blocks}`;
  try {
    const res = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'system', content: 'You are a careful medical-complaints summariser.' }, { role: 'user', content: prompt }] });
    return (res && (res.response || res.result)) || '';
  } catch (e) {
    return 'Summary could not be generated at this time.';
  }
}
// ---------- route handler ----------
export default {
  async fetch(request, env) {
    // Preserve existing behaviour: block US visitors
    if (request.cf && request.cf.country === 'US') {
      return new Response('<!doctype html><html><head><meta charset="utf-8"><title>Access restricted</title></head><body><h1>Access restricted</h1><p>This website is not available to visitors connecting from the United States.</p></body></html>', { status: 403, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const secret = env.SESSION_SECRET || 'dev-insecure-secret-change-me';

    // ---- auth helpers (inline) ----
    async function currentMember() {
      const cookie = getCookie(request, 'sid');
      if (!cookie) return null;
      const payload = await verifySessionCookie(secret, cookie);
      if (!payload || payload.type !== 'member') return null;
      const r = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(payload.id).first();
      return r || null;
    }
    async function currentAdmin() {
      const cookie = getCookie(request, 'sid');
      if (!cookie) return null;
      const payload = await verifySessionCookie(secret, cookie);
      if (!payload || payload.type !== 'admin') return null;
      const r = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(payload.id).first();
      return r || null;
    }

    // ---- public pages ----
    if (path === '/join' && method === 'GET') return html(joinPage());

    if (path === '/login' && method === 'GET') return html(loginPage(url.searchParams.get('registered')));

    if (path === '/admin/login' && method === 'GET') return html(adminLoginPage());

    if (path === '/privacy' && method === 'GET') return html(privacyPage());

    if (path === '/contact' && method === 'GET') return html(contactPage(url.searchParams.get('sent')));

    // ---- API: register ----
    if (path === '/api/register' && method === 'POST') {
      let b;
      try { b = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
      const email = (b.email || '').trim().toLowerCase();
      if (!email || !b.password || !b.first_name || !b.last_name) return json({ error: 'Email, password, first name and last name are required' }, 400);
      if (!b.consent) return json({ error: 'You must consent to your data being processed to submit your story' }, 400);
      if (b.password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
      const exists = await env.DB.prepare('SELECT id FROM members WHERE email = ?').bind(email).first();
      if (exists) return json({ error: 'An account with that email already exists' }, 409);
      const password_hash = await hashPassword(b.password);
      const ins = await env.DB.prepare(`INSERT INTO members (email, password_hash, first_name, middle_name, last_name, sex, race, date_of_birth, nhs_number, hospital_number, hospital_name, usual_consultant, hospital_department, diagnosis, did_you_complain, complained_verbally, number_of_verbal, complained_written, number_of_written, your_story, consent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
        .bind(email, password_hash, b.first_name, b.middle_name || null, b.last_name, b.sex || null, b.race || null, b.date_of_birth || null, b.nhs_number || null, b.hospital_number || null, b.hospital_name || null, b.usual_consultant || null, b.hospital_department || null, b.diagnosis || null, b.did_you_complain ? 1 : 0, b.complained_verbally ? 1 : 0, b.number_of_verbal || 0, b.complained_written ? 1 : 0, b.number_of_written || 0, b.your_story || null).run();
      const memberId = ins.meta.last_row_id;
      if (Array.isArray(b.complaints) && b.complaints.length) {
        for (const c of b.complaints) {
          await env.DB.prepare('INSERT INTO complaints (member_id, problem_department, problem_consultant, medication_name, complaint_text) VALUES (?,?,?,?,?)')
            .bind(memberId, c.problem_department || null, c.problem_consultant || null, c.medication_name || null, c.complaint_text || null).run();
        }
      }
      // best-effort AI summary
      try {
        const member = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(memberId).first();
        const comps = await env.DB.prepare('SELECT * FROM complaints WHERE member_id = ?').bind(memberId).all();
        const summary = await generateMemberSummary(env, member, comps.results || []);
        if (summary) await env.DB.prepare('UPDATE members SET ai_summary = ? WHERE id = ?').bind(summary, memberId).run();
      } catch (e) { /* summary can be regenerated later */ }
      return json({ ok: true });
    }

    // ---- API: contact / data request ----
    if (path === '/api/contact' && method === 'POST') {
      let b; try { b = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
      const email = (b.email || '').trim().toLowerCase();
      if (!email) return json({ error: 'Email is required' }, 400);
      await env.DB.prepare('INSERT INTO data_requests (name, email, request_type, message) VALUES (?,?,?,?)')
        .bind((b.name || '').trim() || null, email, b.request_type || 'other', (b.message || '').trim() || null).run();
      return json({ ok: true });
    }

    // ---- API: member login ----
    if (path === '/api/login' && method === 'POST') {
      let b; try { b = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
      const email = (b.email || '').trim().toLowerCase();
      const m = await env.DB.prepare('SELECT * FROM members WHERE email = ?').bind(email).first();
      if (!m) return json({ error: 'Invalid email or password' }, 401);
      const ok = await verifyPassword(b.password || '', m.password_hash);
      if (!ok) return json({ error: 'Invalid email or password' }, 401);
      const cookie = await makeSessionCookie(secret, { type: 'member', id: m.id });
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookieHeader(cookie, 60 * 60 * 24 * 30) });
    }

    // ---- API: admin login ----
    if (path === '/api/admin/login' && method === 'POST') {
      let b; try { b = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
      const email = (b.email || '').trim().toLowerCase();
      const a = await env.DB.prepare('SELECT * FROM admins WHERE email = ?').bind(email).first();
      if (!a) return json({ error: 'Invalid email or password' }, 401);
      const ok = await verifyPassword(b.password || '', a.password_hash);
      if (!ok) return json({ error: 'Invalid email or password' }, 401);
      const cookie = await makeSessionCookie(secret, { type: 'admin', id: a.id });
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookieHeader(cookie, 60 * 60 * 24 * 30) });
    }

    // ---- logout ----
    if (path === '/logout' && method === 'POST') {
      return new Response(null, { status: 302, headers: { 'Location': '/', 'Set-Cookie': clearCookieHeader() } });
    }

    // ---- member booklet ----
    if (path === '/member' && method === 'GET') {
      const m = await currentMember();
      if (!m) return Response.redirect(new URL('/login', url).toString(), 302);
      const comps = await env.DB.prepare('SELECT * FROM complaints WHERE member_id = ? ORDER BY id').bind(m.id).all();
      return html(memberBookletPage(m, comps.results || []));
    }

    // ---- bootstrap first admin (only works while admins table is empty) ----
    if (path === '/admin/bootstrap' && method === 'GET') {
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first();
      if (count && count.n > 0) return html(layout('Unavailable', '<div class="card"><h1>Bootstrap unavailable</h1><p>An admin account already exists. Use the <a href="/admin/login">admin login</a>.</p></div>'));
      return html(layout('Create first admin', `
        <div class="card">
          <h1>Create the first admin account</h1>
          <p class="muted">This page is only available until the first admin is created.</p>
          <form id="bootForm">
            <label>Email</label><input name="email" type="email" required>
            <label>Password</label><input name="password" type="password" required minlength="8">
            <button type="submit">Create admin</button>
          </form>
        </div>
        <script>
          document.getElementById('bootForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const f = e.target;
            const r = await fetch('/api/admin/bootstrap', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email: f.email.value.trim(), password: f.password.value }) });
            const res = await r.json();
            if (res.ok) { location.href = '/admin/login'; } else { alert(res.error || 'Failed'); }
          });
        </script>
      `));
    }
    if (path === '/api/admin/bootstrap' && method === 'POST') {
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first();
      if (count && count.n > 0) return json({ error: 'An admin already exists' }, 403);
      let b; try { b = await request.json(); } catch { return json({ error: 'Invalid request' }, 400); }
      const email = (b.email || '').trim().toLowerCase();
      if (!email || !b.password || b.password.length < 8) return json({ error: 'Email and an 8+ character password are required' }, 400);
      const password_hash = await hashPassword(b.password);
      await env.DB.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').bind(email, password_hash).run();
      return json({ ok: true });
    }

    // ---- admin dashboard ----
    if (path === '/admin' && method === 'GET') {
      const a = await currentAdmin();
      if (!a) return Response.redirect(new URL('/admin/login', url).toString(), 302);
      const ms = await env.DB.prepare('SELECT id, first_name, last_name, email, hospital_name, created_at FROM members ORDER BY id DESC').all();
      const rq = await env.DB.prepare('SELECT * FROM data_requests ORDER BY id DESC').all();
      return html(adminDashboardPage(ms.results || [], rq.results || []));
    }

    // ---- admin per-member booklet ----
    const mMatch = path.match(/^\/admin\/member\/(\d+)$/);
    if (mMatch && method === 'GET') {
      const a = await currentAdmin();
      if (!a) return Response.redirect(new URL('/admin/login', url).toString(), 302);
      const m = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(mMatch[1]).first();
      if (!m) return html(layout('Not found', '<div class="card"><h1>Member not found</h1></div>'), 404);
      const comps = await env.DB.prepare('SELECT * FROM complaints WHERE member_id = ? ORDER BY id').bind(m.id).all();
      return html(adminMemberBookletPage(m, comps.results || []));
    }

    // ---- admin hospital bulk summary ----
    const hMatch = path.match(/^\/admin\/hospital\/(.+)$/);
    if (hMatch && method === 'GET') {
      const a = await currentAdmin();
      if (!a) return Response.redirect(new URL('/admin/login', url).toString(), 302);
      const hospitalName = decodeURIComponent(hMatch[1]);
      const ms = await env.DB.prepare('SELECT first_name, last_name, your_story, diagnosis FROM members WHERE hospital_name = ?').bind(hospitalName).all();
      const members = ms.results || [];
      if (!members.length) return html(layout('No data', `<div class="card"><h1>No members found for ${escapeHtml(hospitalName)}</h1></div>`));
      const summary = await generateHospitalSummary(env, hospitalName, members);
      return html(hospitalSummaryPage(hospitalName, summary, members));
    }

    // ---- fallback: existing static site ----
    return env.ASSETS.fetch(request);
  }
};
