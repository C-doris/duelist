// IndexedDB Setup
const DB_NAME = 'AssignmentTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'assignments';

let db = null;

// Initialize IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// Generate unique ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Database operations
function addAssignment(assignment) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const newAssignment = {
      id: generateId(),
      ...assignment,
      completed: false,
      createdAt: new Date().toISOString()
    };
    const request = store.add(newAssignment);
    request.onsuccess = () => resolve(newAssignment);
    request.onerror = () => reject(request.error);
  });
}

function updateAssignment(id, updates) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const assignment = { ...getRequest.result, ...updates };
      const putRequest = store.put(assignment);
      putRequest.onsuccess = () => resolve(assignment);
      putRequest.onerror = () => reject(putRequest.error);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

function deleteAssignment(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getAllAssignments() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const assignments = request.result;
      // Sort: incomplete first, then by due date
      assignments.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
      resolve(assignments);
    };
    request.onerror = () => reject(request.error);
  });
}

// Date helpers

function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function isOverdue(dateStr) {
  const due = parseLocalDate(dateStr);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function formatDate(dateStr) {
  const due = new Date(dateStr);
  if (isNaN(due)) return 'Invalid Date';

  const now = new Date();

  const today = new Date();
  today.setHours(0,0,0,0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dueDateOnly = new Date(due);
  dueDateOnly.setHours(0,0,0,0);

  if (dueDateOnly.getTime() === today.getTime()) {
  return 'Today, ' + due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
  if (dueDateOnly.getTime() === tomorrow.getTime()) {
  return 'Tomorrow, ' + due.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Toast notification
function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// Render functions
function renderAssignment(a) {
  const overdue = !a.completed && isOverdue(a.dueDate);
  
  return `
    <div class="assignment-card ${a.completed ? 'completed' : ''} ${overdue ? 'overdue' : ''}" data-id="${a.id}">
      <div class="checkbox ${a.completed ? 'checked' : ''}" data-action="toggle"></div>
      <div class="card-content">
        <div class="card-top">
          <span class="course-badge">${escapeHtml(a.course)}</span>
          ${overdue ? '<span class="overdue-badge">Overdue</span>' : ''}
        </div>
        <div class="assignment-title">${escapeHtml(a.title)}</div>
        <div class="due-date ${overdue ? 'overdue' : ''}">Due: ${formatDate(a.dueDate)}</div>
        ${a.notes ? `<div class="assignment-notes">${escapeHtml(a.notes)}</div>` : ''}
      </div>
      <div class="card-actions">
        <button class="action-btn" data-action="edit" title="Edit">✎</button>
        <button class="action-btn delete" data-action="delete" title="Delete">✕</button>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function render() {
  const assignments = await getAllAssignments();
  const list = document.getElementById('assignmentList');
  const empty = document.getElementById('emptyState');
  const subtitle = document.getElementById('subtitle');
  
  if (assignments.length === 0) {
    list.classList.add('hidden');
    empty.classList.remove('hidden');
    subtitle.textContent = '';
  } else {
    empty.classList.add('hidden');
    list.classList.remove('hidden');
    list.innerHTML = assignments.map(renderAssignment).join('');
    
    const pending = assignments.filter(a => !a.completed).length;
    const overdue = assignments.filter(a => !a.completed && isOverdue(a.dueDate)).length;
    
    if (pending > 0) {
      subtitle.innerHTML = `${pending} pending${overdue > 0 ? ` <span class="overdue">(${overdue} overdue)</span>` : ''}`;
    } else {
      subtitle.textContent = 'All done!';
    }
  }
}

// Modal handling
let editingId = null;
let deleteId = null;

function openModal(assignment = null) {
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const form = document.getElementById('assignmentForm');
  
  editingId = assignment ? assignment.id : null;
  title.textContent = assignment ? 'Edit Assignment' : 'Add Assignment';
  
  document.getElementById('course').value = assignment ? assignment.course : '';
  document.getElementById('title').value = assignment ? assignment.title : '';
  document.getElementById('dueDate').value = assignment ? assignment.dueDate : '';
  document.getElementById('notes').value = assignment ? assignment.notes || '' : '';
  
  // Set default date to today if adding new
  if (!assignment) {
    document.getElementById('dueDate').value = new Date().toISOString().split('T')[0];
  }
  
  overlay.classList.add('active');
  document.getElementById('course').focus();
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  editingId = null;
}

function openDeleteModal(id, title) {
  deleteId = id;
  document.getElementById('deleteMessage').textContent = `This will permanently delete "${title}".`;
  document.getElementById('deleteModalOverlay').classList.add('active');
}

function closeDeleteModal() {
  document.getElementById('deleteModalOverlay').classList.remove('active');
  deleteId = null;
}

// Event handlers
async function handleSubmit(e) {
  e.preventDefault();
  
  const data = {
    course: document.getElementById('course').value.trim(),
    title: document.getElementById('title').value.trim(),
    dueDate: document.getElementById('dueDate').value,
    notes: document.getElementById('notes').value.trim()
  };
  
  try {
    if (editingId) {
      await updateAssignment(editingId, data);
      showToast('Assignment updated', 'success');
    } else {
      await addAssignment(data);
      showToast('Assignment added', 'success');
    }
    closeModal();
    render();
  } catch (err) {
    showToast('Something went wrong', 'error');
  }
}

async function handleToggle(id) {
  const assignments = await getAllAssignments();
  const assignment = assignments.find(a => a.id === id);
  if (assignment) {
    await updateAssignment(id, { completed: !assignment.completed });
    if (!assignment.completed) showToast('Nice work!', 'success');
    render();
  }
}

async function handleEdit(id) {
  const assignments = await getAllAssignments();
  const assignment = assignments.find(a => a.id === id);
  if (assignment) openModal(assignment);
}

async function handleDelete() {
  if (deleteId) {
    await deleteAssignment(deleteId);
    closeDeleteModal();
    showToast('Assignment deleted');
    render();
  }
}

// Initialize app
async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
  }
  
  await initDB();
  render();
  
  // Event listeners
  document.getElementById('addBtn').addEventListener('click', () => openModal());
  document.getElementById('addFirstBtn').addEventListener('click', () => openModal());
  document.getElementById('closeModal').addEventListener('click', closeModal);
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('assignmentForm').addEventListener('submit', handleSubmit);
  
  document.getElementById('closeDeleteModal').addEventListener('click', closeDeleteModal);
  document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
  document.getElementById('confirmDeleteBtn').addEventListener('click', handleDelete);
  
  // Close modals on overlay click
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('deleteModalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });
  
  // Delegate clicks on assignment list
  document.getElementById('assignmentList').addEventListener('click', (e) => {
    const card = e.target.closest('.assignment-card');
    if (!card) return;
    
    const id = card.dataset.id;
    const action = e.target.closest('[data-action]')?.dataset.action;
    
    if (action === 'toggle') handleToggle(id);
    else if (action === 'edit') handleEdit(id);
    else if (action === 'delete') {
      const title = card.querySelector('.assignment-title').textContent;
      openDeleteModal(id, title);
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closeDeleteModal();
    }
  });
}


init();


