---
layout: page
sidebar: false
outline: false
footer: false
---

<script setup>
import LandingIsland from "./.vitepress/theme/LandingIsland.vue";
import Landing from "../scrollcraft/builds/proagents-home/Landing.vue";
</script>

<ClientOnly>
  <LandingIsland>
    <Landing />
  </LandingIsland>
</ClientOnly>
