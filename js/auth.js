import { getSupabase } from './supabase-client.js';

const form = document.getElementById('authForm');
const emailEl = document.getElementById('email');
const passEl = document.getElementById('password');
const nameEl = document.getElementById('fullName');
const nameField = document.getElementById('nameField');
const submitBtn = document.getElementById('submitBtn');
const switchBtn = document.getElementById('switchBtn');
const switchText = document.getElementById('switchText');
const formTitle = document.getElementById('formTitle');
const formSub = document.getElementById('formSub');
const msgBox = document.getElementById('msgBox');

let mode = 'signin'; // or 'signup'

function showMsg(text, type = 'error') {
  msgBox.innerHTML = `<div class="auth-msg ${type}">${text}</div>`;
}
function clearMsg() { msgBox.innerHTML = ''; }

function renderMode() {
  clearMsg();
  if (mode === 'signin') {
    formTitle.textContent = 'Welcome back';
    formSub.textContent = 'Sign in to keep your streaks going.';
    nameField.style.display = 'none';
    submitBtn.textContent = 'Sign in';
    switchText.textContent = "Don't have an account?";
    switchBtn.textContent = 'Sign up';
  } else {
    formTitle.textContent = 'Create your account';
    formSub.textContent = 'Start building routines that stick.';
    nameField.style.display = 'block';
    submitBtn.textContent = 'Create account';
    switchText.textContent = 'Already have an account?';
    switchBtn.textContent = 'Sign in';
  }
}

switchBtn.addEventListener('click', () => {
  mode = mode === 'signin' ? 'signup' : 'signin';
  renderMode();
});

(async function init() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = 'dashboard.html';
  }
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg();
  submitBtn.disabled = true;
  submitBtn.textContent = mode === 'signin' ? 'Signing in…' : 'Creating account…';

  const supabase = await getSupabase();
  const email = emailEl.value.trim();
  const password = passEl.value;

  try {
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = 'dashboard.html';
    } else {
      const fullName = nameEl.value.trim() || email.split('@')[0];
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } }
      });
      if (error) throw error;

      if (data.session) {
        window.location.href = 'dashboard.html';
      } else {
        showMsg('Account created! Check your email to confirm, then sign in.', 'success');
        mode = 'signin';
        renderMode();
      }
    }
  } catch (err) {
    showMsg(err.message || 'Something went wrong.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'signin' ? 'Sign in' : 'Create account';
  }
});

renderMode();
