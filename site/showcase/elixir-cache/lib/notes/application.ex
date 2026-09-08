defmodule Notes.Application do
  @moduledoc "OTP application — starts the notes cache under a supervisor."
  use Application

  @impl true
  def start(_type, _args) do
    children = [
      {Notes.Cache, []}
    ]

    opts = [strategy: :one_for_one, name: Notes.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
