<script>
  import BooksCreate from './BooksCreate.svelte'

  let { screen, onVersionBump = null } = $props()
</script>

<div class="books-tab">
  <BooksCreate {screen} {onVersionBump} />
</div>
