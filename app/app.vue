<script setup lang="ts">
import ParticlesBg from '~/components/inspira/ParticlesBg.vue'
</script>

<template>
  <UApp>
    <div class="relative min-h-screen overflow-x-hidden bg-[#05070a] text-white">
      <!-- 全站粒子背景：固定定位，内容滚动时不动 -->
      <div class="pointer-events-none fixed inset-0 z-0">
        <ParticlesBg
          color="#10b981"
          :quantity="64"
          :ease="90"
          :staticity="60"
          class="opacity-70"
        />
      </div>

      <!-- 顶部绿色光晕 + 底部渐隐，给内容垫一层景深 -->
      <div
        class="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.20),transparent)]"
      />
      <div
        class="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-56 bg-gradient-to-t from-[#05070a] to-transparent"
      />

      <div class="relative z-10">
        <NuxtPage />
      </div>
    </div>
  </UApp>
</template>
