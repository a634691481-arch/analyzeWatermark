<script setup lang="ts">
import type { ParsedMedia, PlatformInfo } from '#shared/types'

const toast = useToast()

const {
  inputUrl,
  loading,
  zipping,
  errorMessage,
  result,
  media,
  selectedIds,
  selectedMedia,
  allSelected,
  watermarkFreeCount,
  parse,
  toggle,
  toggleAll,
  downloadOne,
  downloadOriginal,
  downloadZip,
  copyLink
} = useMediaParser()

const { data: platforms } = await useFetch<PlatformInfo[]>('/api/platforms', {
  default: () => [] as PlatformInfo[]
})

/** 已适配平台名，用于标题与文案，避免每加一个平台就要手改文案 */
const platformNames = computed(() => platforms.value.map(platform => platform.name))
/** 顿号连接：豆包、抖音、小红书 */
const platformList = computed(() => platformNames.value.join('、'))
/** 斜杠连接：豆包 / 抖音 / 小红书 */
const platformSlash = computed(() => platformNames.value.join(' / '))
const platformKeywords = computed(() => platformNames.value.map(name => `${name}去水印`).join(','))
const platformFeatures = computed(() => platformNames.value.map(name => `${name}无水印下载`))

/** 摘要栏三个操作按钮：移动端要挤在一行里，所以收窄内边距、缩小字号、隐藏图标 */
const compactAction = {
  base: 'justify-center px-2 sm:px-3',
  label: 'text-[11px] sm:text-sm truncate',
  leadingIcon: 'hidden sm:inline-block'
}

/** 放大预览：null 表示关闭，否则是 media 数组下标 */
const previewIndex = ref<number | null>(null)

/** 换一批结果时收起预览，避免下标指向错位 */
watch(result, () => {
  previewIndex.value = null
})

function onPreview(item: ParsedMedia) {
  const position = media.value.findIndex(entry => entry.id === item.id)
  if (position >= 0) previewIndex.value = position
}

async function onCopy(item: ParsedMedia) {
  const ok = await copyLink(item)
  toast.add({
    title: ok ? '链接已复制' : '复制失败',
    description: ok ? '已复制无水印资源地址' : '浏览器拒绝了剪贴板访问，请手动复制',
    color: ok ? 'success' : 'error',
    icon: ok ? 'i-lucide-check' : 'i-lucide-triangle-alert'
  })
}

const steps = [
  {
    no: 'STEP 1',
    title: '复制分享文案',
    text: '在 App 里点分享并复制，整段文案直接粘进来就行，会自动挑出链接。'
  },
  {
    no: 'STEP 2',
    title: '粘贴并解析',
    text: '把链接粘贴到上方输入框，点击「解析」。'
  },
  {
    no: 'STEP 3',
    title: '下载无水印文件',
    text: '单个下载，或勾选多个后打包成一个 zip 下载。'
  }
]

useSeoMeta({
  title: '无水印下载工具 · 一键取回原始文件',
  description: () => `粘贴 ${platformSlash.value} 的分享链接，自动解析出云端保存的无水印原图与原视频，支持单个下载与批量打包，无需安装插件。`,
  ogTitle: '无水印下载工具 · 一键取回原始文件',
  ogDescription: () => `支持${platformList.value}。粘贴分享文案即可取回未压缩的无水印原图与原视频。`,
  ogType: 'website',
  ogSiteName: '去水印',
  ogLocale: 'zh_CN',
  twitterCard: 'summary_large_image',
  twitterTitle: '无水印下载工具 · 一键取回原始文件',
  twitterDescription: '粘贴分享文案，取回未压缩的无水印原图与原视频。'
})

// keywords 不在 useSeoMeta 的类型里，单独挂
useHead({
  meta: [
    {
      name: 'keywords',
      content: () => `去水印,无水印下载,${platformKeywords.value},图片下载,视频下载`
    }
  ]
})

/** 结构化数据：让搜索引擎知道这是个 Web 工具，而不是一篇内容页 */
useSchemaOrg([
  defineWebSite({
    name: '去水印',
    inLanguage: 'zh-CN'
  }),
  defineSoftwareApp({
    name: '无水印下载工具',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    description: `解析${platformList.value}的分享链接，取回无水印原图与原视频。`,
    offers: {
      price: '0',
      priceCurrency: 'CNY'
    },
    featureList: [...platformFeatures.value, '批量打包 zip 下载']
  })
])
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
          :label="`已适配 ${platformNames.length} 个平台`"
        />
        <h1 class="mt-4 text-3xl font-bold tracking-tight text-highlighted sm:text-4xl">
          一键解析无水印原片
        </h1>
        <p class="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          粘贴分享链接，自动提取云端保存的<b class="text-highlighted">无水印原图 / 原视频</b>，
          支持单个下载与批量打包，无需安装任何插件。
        </p>

        <!-- 已适配平台：数据来自 /api/platforms，新增平台自动跟着变 -->
        <ul class="mt-7 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          <li v-for="platform in platforms" :key="platform.id">
            <span
              class="group inline-flex items-center gap-2 rounded-full bg-elevated px-3.5 py-2 text-xs ring ring-default transition-colors duration-300 hover:ring-primary/50"
              :title="platform.example"
            >
              <UIcon
                v-if="platform.icon"
                :name="platform.icon"
                class="size-4 shrink-0 text-muted transition-colors duration-300 group-hover:text-primary"
              />
              <span class="font-medium text-toned">{{ platform.name }}</span>
            </span>
          </li>
        </ul>
      </header>

      <ParseForm
        v-model="inputUrl"
        :loading="loading"
        @submit="parse"
      />

      <UAlert
        v-if="errorMessage"
        class="mt-6"
        color="error"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        :title="errorMessage"
        description="请确认链接完整可访问，且内容中包含图片或视频。"
      />

      <section v-if="result" class="mt-10">
        <div
          class="flex flex-col gap-4 rounded-2xl bg-elevated p-4 ring ring-default sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <UBadge :label="result.platform.name" color="primary" variant="subtle" size="sm" />
              <span class="truncate text-sm font-medium text-highlighted">
                {{ result.title || '未命名作品' }}
              </span>
            </div>
            <p class="mt-1 text-xs text-dimmed">
              共 {{ media.length }} 个 · 无水印 {{ watermarkFreeCount }} 个 · 已选 {{ selectedMedia.length }} 个
              <template v-if="result.author"> · 作者 {{ result.author }}</template>
            </p>
          </div>

          <!-- 移动端：三个按钮等分一行；sm 以上恢复自适应排列 -->
          <div class="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :icon="allSelected ? 'i-lucide-square' : 'i-lucide-check-check'"
              :label="allSelected ? '取消全选' : '全选'"
              :ui="compactAction"
              @click="toggleAll"
            />
            <UButton
              size="sm"
              color="primary"
              variant="soft"
              icon="i-lucide-package"
              label="打包下载全部"
              :loading="zipping"
              :disabled="!media.length"
              :ui="compactAction"
              @click="downloadZip(media)"
            />
            <UButton
              size="sm"
              color="primary"
              icon="i-lucide-download"
              :label="`下载选中 (${selectedMedia.length})`"
              :loading="zipping"
              :disabled="!selectedMedia.length"
              :ui="compactAction"
              @click="downloadZip(selectedMedia)"
            />
          </div>
        </div>

        <div class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MediaCard
            v-for="item in media"
            :key="item.id"
            :item="item"
            :selected="selectedIds.includes(item.id)"
            @toggle="toggle"
            @preview="onPreview"
            @download="downloadOne"
            @download-original="downloadOriginal"
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
          原理说明：解析的是平台云端保存的<u>未压缩原始文件</u>，而不是对带水印素材做修补。<br>
          若作者上传时就只有带水印版本，卡片会标注「仅水印版」。
        </p>
      </section>

      <ContactAuthor />

      <BackToTop />

      <MediaPreview
        v-model:index="previewIndex"
        :media="media"
        @download="downloadOne"
        @download-original="downloadOriginal"
      />
    </UContainer>
  </div>
</template>
