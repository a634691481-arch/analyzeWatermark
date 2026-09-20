<script setup lang="ts">
import type { ParsedImage, PlatformInfo } from '#shared/types'

const toast = useToast()

const {
  inputUrl,
  loading,
  zipping,
  errorMessage,
  result,
  images,
  selectedIds,
  selectedImages,
  allSelected,
  watermarkFreeCount,
  parse,
  toggle,
  toggleAll,
  downloadOne,
  downloadZip,
  copyLink
} = useImageParser()

const { data: platforms } = await useFetch<PlatformInfo[]>('/api/platforms', {
  default: () => [] as PlatformInfo[]
})

async function onCopy(image: ParsedImage) {
  const ok = await copyLink(image)
  toast.add({
    title: ok ? '链接已复制' : '复制失败',
    description: ok ? '已复制无水印原图地址' : '浏览器拒绝了剪贴板访问，请手动复制',
    color: ok ? 'success' : 'error',
    icon: ok ? 'i-lucide-check' : 'i-lucide-triangle-alert'
  })
}

const steps = [
  {
    no: 'STEP 1',
    title: '复制分享链接',
    text: '在豆包 App 或网页端打开会话，点分享并复制链接。'
  },
  {
    no: 'STEP 2',
    title: '粘贴并解析',
    text: '把链接粘贴到上方输入框，点击「解析图片」。'
  },
  {
    no: 'STEP 3',
    title: '下载无水印原图',
    text: '单张下载，或勾选多张后打包成一个 zip 下载。'
  }
]

useHead({
  title: 'AI 生图去水印 · 一键解析无水印原图'
})
</script>

<template>
  <div class="min-h-screen bg-default">
    <UContainer class="max-w-6xl py-10 sm:py-16">
      <header class="text-center">
        <UBadge
          color="primary"
          variant="subtle"
          size="sm"
          icon="i-lucide-image-down"
          label="AI 生图工具箱"
        />
        <h1 class="mt-4 text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
          一键解析无水印原图
        </h1>
        <p class="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          粘贴 AI 生图的分享链接，自动提取云端保存的<b class="text-highlighted">无水印原图</b>，
          支持单张下载与批量打包，无需安装任何插件。
        </p>
      </header>

      <ParseForm
        v-model="inputUrl"
        :loading="loading"
        :platforms="platforms"
        @submit="parse"
      />

      <UAlert
        v-if="errorMessage"
        class="mt-6"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="errorMessage"
        description="请确认链接完整可访问，且内容中包含 AI 生成的图片。"
      />

      <section v-if="result" class="mt-10">
        <div
          class="flex flex-col gap-4 rounded-2xl bg-elevated p-4 ring ring-default sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <UBadge :label="result.platform.name" color="primary" variant="subtle" size="sm" />
              <span class="truncate text-sm font-medium text-highlighted">
                {{ result.title || '分享会话' }}
              </span>
            </div>
            <p class="mt-1 text-xs text-dimmed">
              共 {{ images.length }} 张 · 无水印 {{ watermarkFreeCount }} 张 · 已选 {{ selectedImages.length }} 张
              <template v-if="result.author"> · 作者 {{ result.author }}</template>
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :icon="allSelected ? 'i-lucide-square' : 'i-lucide-check-check'"
              :label="allSelected ? '取消全选' : '全选'"
              @click="toggleAll"
            />
            <UButton
              size="sm"
              color="primary"
              variant="soft"
              icon="i-lucide-package"
              label="打包下载全部"
              :loading="zipping"
              :disabled="!images.length"
              @click="downloadZip(images)"
            />
            <UButton
              size="sm"
              color="primary"
              icon="i-lucide-download"
              :label="`下载选中 (${selectedImages.length})`"
              :loading="zipping"
              :disabled="!selectedImages.length"
              @click="downloadZip(selectedImages)"
            />
          </div>
        </div>

        <div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ImageCard
            v-for="image in images"
            :key="image.id"
            :image="image"
            :selected="selectedIds.includes(image.id)"
            @toggle="toggle"
            @download="downloadOne"
            @copy="onCopy"
          />
        </div>
      </section>

      <section v-else-if="!loading" class="mt-14">
        <div class="grid gap-4 sm:grid-cols-3">
          <div
            v-for="step in steps"
            :key="step.no"
            class="rounded-2xl bg-elevated p-5 ring ring-default"
          >
            <span class="text-xs font-semibold tracking-wide text-primary">{{ step.no }}</span>
            <h3 class="mt-2 text-sm font-medium text-highlighted">{{ step.title }}</h3>
            <p class="mt-1 text-xs leading-relaxed text-muted">{{ step.text }}</p>
          </div>
        </div>

        <p class="mt-8 text-center text-xs leading-relaxed text-dimmed">
          原理说明：解析的是平台云端保存的<u>未压缩原始文件</u>，而不是对带水印图片做修补。<br>
          若作者上传时就只有带水印版本，卡片会标注「仅水印版」。
        </p>
      </section>
    </UContainer>
  </div>
</template>
