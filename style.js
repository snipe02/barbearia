// =============================================================
//  VARIÁVEIS GLOBAIS
// =============================================================
let currentAppointmentId = null;
let allAppointments = [];
let isAdmin = false;
let lastBookingData = null;

let currentSlide = 0;
let slideInterval = null;
const totalSlides = 5; // número de slides (c1.jpeg a c6.jpeg, mas são 5 no HTML)

const $ = (id) => document.getElementById(id);
const viewClient = $("viewClient");
const viewAdminLogin = $("viewAdminLogin");
const viewAdminDashboard = $("viewAdminDashboard");
const statWaiting = $("statWaiting");
const statCompleted = $("statCompleted");
const statTotal = $("statTotal");
const submitBtn = $("submitBtn");
const toast = $("toast");
const toastMsg = $("toastMsg");
const sliderTrack = $("sliderTrack");
const sliderDots = $("sliderDots");
const lightbox = $("lightbox");
const lightboxImg = $("lightboxImg");
const lightboxCaption = $("lightboxCaption");

// =============================================================
//  TOAST
// =============================================================
function showToast(msg, type = "success") {
  toastMsg.textContent = msg;
  toast.className = "toast " + type + " show";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 3500);
}

// =============================================================
//  LIGHTBOX
// =============================================================
function openLightbox(imgSrc, caption, sub) {
  lightboxImg.src = imgSrc;
  lightboxImg.alt = caption;
  lightboxCaption.innerHTML = `WesleyCort - ${caption} <small>${sub || ""}</small>`;
  lightbox.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lightbox.classList.remove("open");
  document.body.style.overflow = "";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

// =============================================================
//  SLIDER
// =============================================================
function goToSlide(index) {
  if (index < 0) index = totalSlides - 1;
  if (index >= totalSlides) index = 0;
  currentSlide = index;
  sliderTrack.style.transform = `translateX(-${currentSlide * 100}%)`;
  document.querySelectorAll(".slider-dots span").forEach((dot, i) => {
    dot.classList.toggle("active", i === currentSlide);
  });
}

function moveSlide(direction) {
  goToSlide(currentSlide + direction);
  resetSlideInterval();
}

function resetSlideInterval() {
  if (slideInterval) {
    clearInterval(slideInterval);
    slideInterval = null;
  }
  slideInterval = setInterval(() => {
    goToSlide(currentSlide + 1);
  }, 4000);
}

function initSlider() {
  sliderDots.innerHTML = "";
  for (let i = 0; i < totalSlides; i++) {
    const dot = document.createElement("span");
    dot.addEventListener("click", () => {
      goToSlide(i);
      resetSlideInterval();
    });
    sliderDots.appendChild(dot);
  }
  goToSlide(0);
  resetSlideInterval();

  document.querySelectorAll(".slider-slide").forEach((slide) => {
    slide.addEventListener("click", function (e) {
      if (e.target.closest(".slider-btn") || e.target.closest(".slider-dots")) return;
      const img = this.querySelector("img");
      const captionEl = this.querySelector(".slide-caption");
      if (img) {
        const caption = captionEl ? captionEl.childNodes[0].textContent.trim() : "Corte";
        const sub = captionEl ? captionEl.querySelector("small")?.textContent || "" : "";
        openLightbox(img.src, caption, sub);
      }
    });
  });
}

// =============================================================
//  ESTATÍSTICAS PÚBLICAS
// =============================================================
async function updateStats() {
  try {
    const snapshot = await db.collection("appointments").get();
    let waiting = 0, completed = 0;
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.status === "waiting") waiting++;
      else if (data.status === "completed") completed++;
    });
    statWaiting.textContent = waiting;
    statCompleted.textContent = completed;
    statTotal.textContent = snapshot.size;
  } catch (err) {
    console.error("Erro ao atualizar stats:", err);
  }
}

// =============================================================
//  NOTIFICAÇÃO PARA O DONO VIA WHATSAPP (CALLOBOT)
// =============================================================
function notifyOwner(appointmentData) {
  // 🔑 Substitua pela sua chave de API do CallMeBot (https://www.callmebot.com/)
  const apiKey = "SUA_API_KEY";
  const ownerPhone = "558695604785";
  const message = `🔔 *NOVO AGENDAMENTO!*\n\n👤 *Cliente:* ${appointmentData.name}\n✂️ *Serviço:* ${appointmentData.service}\n🕒 *Horário:* ${appointmentData.time}\n\n✅ Agendamento registrado com sucesso.`;
  const url = `https://api.callmebot.com/whatsapp.php?phone=${ownerPhone}&text=${encodeURIComponent(message)}&apikey=${apiKey}`;
  fetch(url)
    .then((res) => { if (res.ok) console.log("✅ Notificação enviada."); else console.warn("⚠️ Falha ao enviar."); })
    .catch((err) => console.error("❌ Erro ao enviar notificação:", err));
}

// =============================================================
//  SUBMISSÃO DO FORMULÁRIO
// =============================================================
async function handleSubmit(e) {
  e.preventDefault();

  const name = $("clientName").value.trim();
  const service = $("clientService").value;
  const time = $("clientTime").value;

  if (!name || !service || !time) {
    showToast("Preencha todos os campos obrigatórios.", "error");
    return;
  }

  // Verifica disponibilidade do horário
  try {
    const querySnapshot = await db
      .collection("appointments")
      .where("time", "==", time)
      .where("status", "==", "waiting")
      .get();

    if (!querySnapshot.empty) {
      showToast(`❌ Horário indisponível! Já existe um agendamento para as ${time}. Escolha outro horário.`, "error");
      return;
    }
  } catch (err) {
    console.error("Erro ao verificar horário:", err);
    showToast("Erro ao verificar disponibilidade. Tente novamente.", "error");
    return;
  }

  lastBookingData = { name, service, time };
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Agendando...';

  try {
    const docRef = await db.collection("appointments").add({
      name,
      service,
      time,
      status: "waiting",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    currentAppointmentId = docRef.id;
    notifyOwner({ name, service, time });
    updateStats();
    redirectWhatsApp();
  } catch (err) {
    console.error("Erro ao salvar:", err);
    let msg = "Erro ao agendar. Verifique as regras de segurança do Firestore.";
    if (err.code === "permission-denied") {
      msg = "Permissão negada. Configure as regras de segurança do Firestore para permitir escrita na coleção 'appointments'.";
    }
    showToast(msg, "error");
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-calendar-check"></i> Agendar';
  }
}

function redirectWhatsApp() {
  const data = lastBookingData || {};
  const name = data.name || $("clientName").value.trim() || "Cliente";
  const service = data.service || $("clientService").value || "Corte";
  const time = data.time || $("clientTime").value || "09:00";
  const msg = `Olá! 👋 Gostaria de confirmar meu agendamento:\n\n✂️ *Serviço:* ${service}\n🕒 *Horário:* ${time}\n👤 *Nome:* ${name}\n\nAgradeço desde já! 🙌`;
  const url = `https://wa.me/558695604785?text=${encodeURIComponent(msg)}`;
  window.location.href = url;
}

function resetForm() {
  $("scheduleForm").reset();
  currentAppointmentId = null;
  showToast("Pronto para um novo agendamento!");
  submitBtn.disabled = false;
  submitBtn.innerHTML = '<i class="fas fa-calendar-check"></i> Agendar';
}

// =============================================================
//  ADMIN - TOGGLE VIEW
// =============================================================
function toggleAdminView() {
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    showView("viewAdminDashboard");
    loadAdminData();
    return;
  }
  if (viewClient.classList.contains("active")) {
    showView("viewAdminLogin");
  } else {
    showView("viewClient");
  }
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $(viewId).classList.add("active");
}

// =============================================================
//  ADMIN - LOGIN
// =============================================================
async function handleAdminLogin(e) {
  e.preventDefault();
  const email = $("adminEmail").value.trim();
  const password = $("adminPassword").value.trim();
  if (!email || !password) {
    showToast("Preencha e-mail e senha.", "error");
    return;
  }
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Entrando...';

  try {
    await auth.signInWithEmailAndPassword(email, password);
    showToast("Bem-vindo, administrador!");
    showView("viewAdminDashboard");
    loadAdminData();
  } catch (err) {
    console.error(err);
    let msg = "Erro ao entrar. Verifique suas credenciais.";
    if (err.code === "auth/user-not-found") msg = "Usuário não encontrado.";
    if (err.code === "auth/wrong-password") msg = "Senha incorreta.";
    if (err.code === "auth/invalid-email") msg = "E-mail inválido.";
    showToast(msg, "error");
  }
  btn.disabled = false;
  btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
}

// =============================================================
//  ADMIN - LOGOUT
// =============================================================
async function logoutAdmin() {
  try {
    await auth.signOut();
    showToast("Desconectado.");
    showView("viewClient");
    updateStats();
  } catch (err) {
    showToast("Erro ao sair.", "error");
  }
}

// =============================================================
//  ADMIN - CARREGAR DADOS
// =============================================================
async function loadAdminData() {
  const tbody = $("adminTableBody");
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;"><span class="spinner"></span> Carregando...</td></tr>`;

  try {
    const snapshot = await db.collection("appointments").orderBy("createdAt", "desc").get();
    allAppointments = [];
    let waiting = 0, completed = 0;
    snapshot.forEach((doc) => {
      const data = doc.data();
      const item = { id: doc.id, ...data };
      allAppointments.push(item);
      if (data.status === "waiting") waiting++;
      else if (data.status === "completed") completed++;
    });
    $("adminTotal").textContent = snapshot.size;
    $("adminWaiting").textContent = waiting;
    $("adminCompleted").textContent = completed;
    renderAdminTable(allAppointments);
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar dados.</p></td></tr>`;
    showToast("Erro ao carregar agendamentos.", "error");
  }
}

// =============================================================
//  ADMIN - RENDER TABELA
// =============================================================
function renderAdminTable(items) {
  const tbody = $("adminTableBody");
  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><i class="fas fa-inbox"></i><p>Nenhum agendamento encontrado.</p></td></tr>`;
    return;
  }
  let html = "";
  items.forEach((item, idx) => {
    const statusClass = item.status === "waiting" ? "waiting" : "completed";
    const statusLabel = item.status === "waiting" ? "⏳ Na fila" : "✅ Finalizado";
    const dateStr = item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleString("pt-BR") : "—";
    const time = item.time || "—";
    html += `
      <tr>
        <td><strong>#${idx + 1}</strong></td>
        <td><strong>${escapeHtml(item.name || "—")}</strong></td>
        <td>${escapeHtml(item.phone || "—")}</td>
        <td>${escapeHtml(item.service || "—")}</td>
        <td><span style="color:#c9a84c;font-weight:600;">${escapeHtml(time)}</span></td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td style="font-size:13px;color:#8a8478;">${dateStr}</td>
        <td>
          <div class="action-btns">
            ${item.status === "waiting" ? `<button class="btn btn-success btn-sm" onclick="markCompleted('${item.id}')"><i class="fas fa-check"></i></button>` : `<button class="btn btn-outline btn-sm" onclick="markWaiting('${item.id}')" style="border-color:rgba(201,168,76,0.3);color:#c9a84c;"><i class="fas fa-undo"></i></button>`}
            <button class="btn btn-danger btn-sm" onclick="deleteAppointment('${item.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

// =============================================================
//  ADMIN - AÇÕES CRUD
// =============================================================
async function markCompleted(id) {
  try {
    await db.collection("appointments").doc(id).update({ status: "completed" });
    showToast("Agendamento marcado como finalizado!");
    await loadAdminData();
    await updateStats();
  } catch (err) { showToast("Erro ao atualizar.", "error"); console.error(err); }
}

async function markWaiting(id) {
  try {
    await db.collection("appointments").doc(id).update({ status: "waiting" });
    showToast("Agendamento retornado para a fila.");
    await loadAdminData();
    await updateStats();
  } catch (err) { showToast("Erro ao atualizar.", "error"); console.error(err); }
}

async function deleteAppointment(id) {
  if (!confirm("Tem certeza que deseja excluir este agendamento?")) return;
  try {
    await db.collection("appointments").doc(id).delete();
    showToast("Agendamento excluído.");
    await loadAdminData();
    await updateStats();
  } catch (err) { showToast("Erro ao excluir.", "error"); console.error(err); }
}

// =============================================================
//  UTIL
// =============================================================
function escapeHtml(text) {
  if (!text) return "—";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// =============================================================
//  AUTH STATE
// =============================================================
auth.onAuthStateChanged((user) => {
  if (user && !user.isAnonymous) {
    isAdmin = true;
    if (viewAdminLogin.classList.contains("active")) {
      showView("viewAdminDashboard");
      loadAdminData();
    }
  } else {
    isAdmin = false;
    if (viewAdminDashboard.classList.contains("active") || viewAdminLogin.classList.contains("active")) {
      showView("viewClient");
      updateStats();
    }
  }
});

// =============================================================
//  CLIQUE NO LOGO → ABRE LIGHTBOX (com distinção de duplo clique)
// =============================================================
const logoArea = document.getElementById("logoArea");
let clickTimer = null;

logoArea.addEventListener("click", function (e) {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
    return;
  }
  clickTimer = setTimeout(() => {
    const img = document.querySelector(".logo-icon img");
    if (img && img.src) {
      const titleEl = document.querySelector(".logo-text h1");
      const subEl = document.querySelector(".logo-text span");
      const title = titleEl ? titleEl.textContent.trim() : "Barbearia";
      const sub = subEl ? subEl.textContent.trim() : "";
      openLightbox(img.src, title, sub);
    }
    clickTimer = null;
  }, 300);
});

logoArea.addEventListener("dblclick", function (e) {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }
  toggleAdminView();
  e.preventDefault();
});

// =============================================================
//  INICIALIZAÇÃO
// =============================================================
// Login anônimo (já feito no firebase-config.js, mas reforçamos aqui)
auth.signInAnonymously()
  .then(() => console.log("✅ Autenticado anonimamente."))
  .catch((error) => console.warn("⚠️ Login anônimo falhou:", error));

// Inicia atualizações
updateStats();
setInterval(updateStats, 30000);
initSlider();

// Evento para tecla Enter no campo senha do admin
document.getElementById("adminPassword").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    document.getElementById("adminLoginForm").dispatchEvent(new Event("submit"));
  }
});

console.log("🪒 Barbearia WesleyCort — Sistema de Agendamento (completo)");
console.log("📌 Firebase configurado com:", firebaseConfig.projectId);
console.log("📸 Galeria com Lightbox e legendas!");
console.log("🕒 Verificação de horário ativa — não permite duplicatas.");
console.log("⚡ Redirecionamento automático e imediato para WhatsApp.");
console.log("🔒 Acesso admin: dê dois cliques no logotipo.");
console.log("🖼️ Clique simples no logo → abre em tela cheia.");