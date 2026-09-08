defmodule Notes.Cache do
  @moduledoc "GenServer cache — sync gets, async puts, crash-restarted by the supervisor."
  use GenServer

  # Client API

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, %{}, Keyword.put_new(opts, :name, __MODULE__))
  end

  def get(key), do: GenServer.call(__MODULE__, {:get, key})

  def put(key, value), do: GenServer.cast(__MODULE__, {:put, key, value})

  # Server callbacks

  @impl true
  def init(state), do: {:ok, state}

  @impl true
  def handle_call({:get, key}, _from, state) do
    {:reply, Map.get(state, key), state}
  end

  @impl true
  def handle_cast({:put, key, value}, state) do
    {:noreply, Map.put(state, key, value)}
  end
end
