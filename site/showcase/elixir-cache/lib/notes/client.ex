defmodule Notes.Client do
  @moduledoc "Call-site helper — other processes talk to the cache through here."

  def fetch(key), do: Notes.Cache.get(key)

  def store(key, value) do
    Notes.Cache.put(key, value)
    :ok
  end
end
