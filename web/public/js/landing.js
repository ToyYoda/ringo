import { api, $, errorToast } from './common.js';

const signup = $('#signup');
const login = $('#login');
const tabS = $('#tabSignup');
const tabL = $('#tabLogin');

const show = (which) => {
  signup.classList.toggle('hidden', which !== 'signup');
  login.classList.toggle('hidden', which !== 'login');
  tabS.classList.toggle('on', which === 'signup');
  tabL.classList.toggle('on', which === 'login');
};
tabS.onclick = () => show('signup');
tabL.onclick = () => show('login');

const data = (form) => Object.fromEntries(new FormData(form).entries());

signup.onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api('POST', '/api/auth/signup', data(signup));
    location.href = '/verwaltung';
  } catch (err) { errorToast(err); }
};

login.onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api('POST', '/api/auth/login', data(login));
    location.href = '/verwaltung';
  } catch (err) { errorToast(err); }
};

// Already logged in → offer the dashboard.
api('GET', '/api/auth/me').then((me) => {
  if (me.user) {
    const a = document.querySelector('.lp-nav .btn');
    a.textContent = 'Zur Verwaltung';
    a.href = '/verwaltung';
  }
}).catch(() => {});
if (location.hash === '#anmelden' && new URLSearchParams(location.search).has('login')) show('login');
