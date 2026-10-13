const title = document.getElementById('title')!;
const box = document.getElementById('box')!;
const sessionId = new URLSearchParams(location.search).get('session_id');

async function load() {
  if (!sessionId) {
    title.textContent = "We couldn't find that order";
    return;
  }
  const res = await fetch(`/api/order-status?session_id=${encodeURIComponent(sessionId)}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    title.textContent = "We couldn't find that order";
    return;
  }
  document.getElementById('ref')!.textContent = data.ref;
  box.hidden = false;
  if (data.paid) {
    title.textContent = 'Thank you, your order is paid';
    document.getElementById('detail')!.textContent =
      `We'll laminate, print and post it, usually within 2 working days.${data.email ? ` A receipt is on its way to ${data.email}.` : ''}`;
  } else {
    title.textContent = 'Your payment is processing';
    document.getElementById('detail')!.textContent = "We'll start printing as soon as your payment goes through. Stripe will email you a receipt.";
  }
}
load();
