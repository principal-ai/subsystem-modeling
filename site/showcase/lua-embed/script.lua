-- Guest script — called from C; can call back into host_log.
function greet(name)
  host_log("greeting " .. name)
  return "hello, " .. name
end
