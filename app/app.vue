<template>
  <UApp>
    <!-- 全局亮/暗切换：固定右上角，所有页面通用 -->
    <div class="fixed right-4 top-4 z-50">
      <UColorModeButton
        color="neutral"
        variant="ghost"
        class="bg-default/60 ring ring-default backdrop-blur-sm"
        aria-label="切换亮色 / 暗色模式"
      />
    </div>

    <NuxtPage />
  </UApp>
</template>
