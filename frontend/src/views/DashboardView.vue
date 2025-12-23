<template>
  <div class="dashboard-container">
    <button class="logout-btn" @click="logout">Sair</button>
    <h1>🏆 Funcionários do Mês</h1>

    <div class="month-selector">
      <input type="month" v-model="selectedMonth" />
      <button @click="fetchRanking">Buscar</button>
    </div>

    <table class="ranking-table">
      <thead>
      <tr>
        <th>#</th>
        <th>Usuário</th>
        <th>Pontos</th>
      </tr>
      </thead>
      <tbody>
      <tr v-for="(user, index) in ranking" :key="user.username">
        <td>{{ index + 1 }}</td>
        <td>{{ user.username }}</td>
        <td>{{ user.total }}</td>
      </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { ref, onMounted } from 'vue'
import axios from 'axios'

const router = useRouter()

const logout = () => {
  localStorage.removeItem('isAuthenticated')
  router.push('/login')
}

const ranking = ref([])
const selectedMonth = ref(new Date().toISOString().substr(0, 7))

const fetchRanking = async () => {
  const res = await axios.get('http://localhost:3001/ranking', {
    params: {
      month: selectedMonth.value
    }
  })
  ranking.value = res.data
}

onMounted(fetchRanking)
</script>

<style scoped>
.dashboard-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  background-color: #fce4ec; /* Rosa claro */
  min-height: 100vh;
}

h1 {
  color: #d81b60; /* Rosa mais escuro */
  margin-bottom: 1.5rem;
  text-align: center;
}

.month-selector {
  display: flex;
  margin-bottom: 1.5rem;
}

input[type="month"] {
  padding: 0.75rem;
  border: 1px solid #f48fb1; /* Rosa médio */
  border-radius: 0.5rem;
  margin-right: 1rem;
}

button {
  background-color: #e91e63; /* Rosa choque */
  color: white;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

button:hover {
  background-color: #c2185b; /* Rosa choque mais escuro */
}

.ranking-table {
  width: 100%;
  max-width: 800px;
  border-collapse: collapse;
  margin-top: 1rem;
  background-color: #fff;
  border-radius: 1rem;
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

th,
td {
  padding: 1rem;
  text-align: left;
}

thead {
  background-color: #f48fb1; /* Rosa médio */
  color: white;
}

tbody tr:nth-child(odd) {
  background-color: #f8bbd0; /* Rosa mais claro */
}
</style>