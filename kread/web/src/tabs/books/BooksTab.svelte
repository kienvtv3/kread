<script>
  import SubViewToggle from '../../components/SubViewToggle.svelte'
  import BooksCreate from './BooksCreate.svelte'
  import BooksDevice from './BooksDevice.svelte'
  import { connection } from '../../stores/connection.svelte.js'

  let subView = $state('create')
</script>

<div class="books-tab">
  <SubViewToggle
    active={subView}
    disabled={!connection.connected}
    onToggle={(v) => subView = v}
  />

  {#if subView === 'create'}
    <BooksCreate />
  {:else}
    <BooksDevice />
  {/if}
</div>
