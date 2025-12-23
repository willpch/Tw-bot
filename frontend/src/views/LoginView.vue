<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <h1>👋 Bem-vinda, Lais!</h1>
        <p class="subtitle">Painel de Controle de Pontos</p>
      </div>

      <div class="login-form">
        <div class="input-group">
          <input v-model="username" type="text" placeholder="Usuário" />
        </div>

        <div class="input-group">
          <input v-model="password" type="password" placeholder="Senha" />
        </div>

        <button @click="login">Entrar</button>

        <p v-if="error" class="error-message">{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const username = ref('')
const password = ref('')
const error = ref('')
const router = useRouter()

const login = async () => {
  try {
    const res = await axios.post('http://localhost:3001/login', {
      username: username.value,
      password: password.value
    })
    if (res.data.success) {
      localStorage.setItem('isAuthenticated', 'true')
      router.push('/dashboard')
    }
  } catch (err) {
    error.value = 'Usuário ou senha inválidos'
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%);
}

.login-card {
  background: white;
  width: 400px;
  aspect-ratio: 1;
  border-radius: 20px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  padding: 2rem;
  display: flex;
  flex-direction: column;
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-header h1 {
  color: #d81b60;
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #757575;
  font-size: 1.1rem;
}

.login-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
}

.input-group input {
  width: 90%;
  padding: 1rem;
  border: 2px solid #f48fb1;
  border-radius: 10px;
  font-size: 1rem;
  transition: border-color 0.3s ease;
}

.input-group input:focus {
  outline: none;
  border-color: #d81b60;
}

button {
  background-color: #d81b60;
  color: white;
  padding: 1rem;
  border: none;
  border-radius: 10px;
  font-size: 1rem;
  cursor: pointer;
  transition: background-color 0.3s ease;
  margin-top: 1rem;
}

button:hover {
  background-color: #c2185b;
}

.error-message {
  color: #f44336;
  text-align: center;
  margin-top: 1rem;
}
</style>